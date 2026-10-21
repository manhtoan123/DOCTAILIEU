import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {afterAll,afterEach,beforeAll,describe,expect,it} from 'vitest';

// Independent migration review: synthetic rows only; never opens persisted app DBs.
const migrationNames=['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql','0005_cloud_originals.sql'];
const migrations=migrationNames.map(name=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
const statements=(sql:string)=>sql.replace(/^--.*$/gm,'').trim().split(/;\s*(?=(?:CREATE|INSERT|ALTER|DROP|UPDATE)\s)/i).map(s=>s.trim()).filter(Boolean);
const books="INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) VALUES(?,'Review',?, ?,?, ?,1)";
const originals="INSERT INTO cloud_originals(book_id,source_id,descriptor_json,sha256,bytes,object_key,state,updated_at) VALUES(?,?,'{}',?,?,?,'pending',1)";
const sha='a'.repeat(64),databases:DatabaseSync[]=[];
function sqlite(){const db=new DatabaseSync(':memory:');databases.push(db);for(const sql of migrations.slice(0,3))db.exec(sql);return db;}
function book(db:DatabaseSync,id:string,bytes:number,state='ready'){db.prepare(books).run(id,sha,bytes,state,'books/'+id);}
afterEach(()=>{for(const db of databases.splice(0))db.close();});

describe('independent SQLite migration semantics',()=>{
  it('preserves all old rows and tombstones; seeds ready, pending and deleted reservations exactly',()=>{
    const db=sqlite();book(db,'ready',5);book(db,'pending',7,'pending');book(db,'deleted',11);
    db.exec("INSERT INTO cloud_book_deletions VALUES('deleted',1)");
    const before=db.prepare('SELECT * FROM cloud_books ORDER BY id').all();
    db.exec(migrations[3]);
    db.prepare(originals).run('ready','source',sha,13,'originals/source');
    db.exec(migrations[3]);
    expect(db.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:36});
    expect(db.prepare('SELECT * FROM cloud_books ORDER BY id').all()).toEqual(before);
    expect(db.prepare('SELECT * FROM cloud_book_deletions').all()).toEqual([{id:'deleted',deleted_at:1}]);
  });
  it('every partial installation prefix either includes an old write in seed or rejects it without charge',()=>{
    const pieces=statements(migrations[3]);
    for(let cut=0;cut<pieces.length;cut++){
      const db=sqlite();book(db,'old',3);for(const sql of pieces.slice(0,cut))db.exec(sql);
      let wrote=false;try{book(db,'race',5);wrote=true;}catch(error){expect(String(error)).toContain('cloud_storage_budget_exceeded');}
      db.exec(migrations[3]);
      expect(db.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:wrote?8:3});
      expect(db.prepare('SELECT COUNT(*) AS count FROM cloud_books').get()).toEqual({count:wrote?2:1});
    }
  });
  it('overbudget legacy baseline fails seed, retains existing rows and blocks old writers on both initial and retry runs',()=>{
    const db=sqlite();for(let i=0;i<269;i++)book(db,'legacy'+i,33_554_432,i%2?'pending':'ready');
    const before=db.prepare('SELECT SUM(bytes) AS total FROM cloud_books').get();
    for(let attempt=0;attempt<2;attempt++){
      expect(()=>db.exec(migrations[3])).toThrow(/CHECK constraint/);
      expect(()=>book(db,'new',1)).toThrow('cloud_storage_budget_exceeded');
      expect(db.prepare('SELECT COUNT(*) AS count FROM cloud_storage_budget').get()).toEqual({count:0});
      expect(db.prepare('SELECT SUM(bytes) AS total FROM cloud_books').get()).toEqual(before);
    }
  });
  it('duplicate no-op INSERTs at full quota neither fail nor charge, including pending original',()=>{
    const db=sqlite();db.exec(migrations[3]);book(db,'book',3);
    db.prepare(originals).run('book','source',sha,5,'originals/source');db.exec('UPDATE cloud_storage_budget SET used_bytes=9000000000');
    db.prepare(books+' ON CONFLICT(id) DO NOTHING').run('book',sha,3,'ready','books/book');
    db.prepare(originals+' ON CONFLICT(book_id,source_id) DO NOTHING').run('book','source',sha,5,'originals/source');
    expect(db.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:9_000_000_000});
    expect(()=>book(db,'new',1)).toThrow('cloud_storage_budget_exceeded');
  });
  it('migration retry preserves a conservatively higher charged total without decreasing or rejecting the seed',()=>{
    const db=sqlite();db.exec(migrations[3]);book(db,'book',3);db.prepare(originals).run('book','source',sha,5,'originals/source');
    db.exec('UPDATE cloud_storage_budget SET used_bytes=100');db.exec(migrations[3]);db.exec(migrations[3]);
    expect(db.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:100});
    expect(db.prepare('SELECT SUM(bytes) AS sum FROM cloud_books').get()).toEqual({sum:3});
    expect(db.prepare('SELECT SUM(bytes) AS sum FROM cloud_originals').get()).toEqual({sum:5});
  });
  it('tombstone blocks fresh original reservations while keeping prior bytes charged',()=>{
    const db=sqlite();db.exec(migrations[3]);book(db,'book',3);db.prepare(originals).run('book','source',sha,5,'originals/source');
    db.exec("INSERT INTO cloud_book_deletions VALUES('book',1)");
    expect(()=>db.prepare(originals).run('book','new',sha,5,'originals/new')).toThrow('original_book_unavailable');
    expect(db.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:8});
  });
  it('singleton replacement cannot reduce retained quota (SQLite REPLACE bypass regression)',()=>{
    const db=sqlite();db.exec(migrations[3]);book(db,'book',3);
    try{db.exec('INSERT OR REPLACE INTO cloud_storage_budget VALUES(1,0)');}catch{/* Rejection is acceptable. */}
    expect(db.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:3});
  });
  it('replacement cannot overwrite a retained immutable snapshot (SQLite REPLACE bypass regression)',()=>{
    const db=sqlite();db.exec(migrations[3]);book(db,'book',3);
    const before=db.prepare('SELECT * FROM cloud_books').get();
    try{db.prepare(books.replace('INSERT INTO','INSERT OR REPLACE INTO')).run('book','b'.repeat(64),2,'ready','other-key');}catch{/* Rejection is acceptable. */}
    expect(db.prepare('SELECT * FROM cloud_books').get()).toEqual(before);
  });
  it('replacement cannot overwrite a retained original descriptor (SQLite REPLACE bypass regression)',()=>{
    const db=sqlite();db.exec(migrations[3]);book(db,'book',3);db.prepare(originals).run('book','source',sha,5,'originals/source');
    const before=db.prepare('SELECT * FROM cloud_originals').get();
    try{db.prepare(originals.replace('INSERT INTO','INSERT OR REPLACE INTO')).run('book','source','b'.repeat(64),2,'originals/changed');}catch{/* Rejection is acceptable. */}
    expect(db.prepare('SELECT * FROM cloud_originals').get()).toEqual(before);
  });
  it('a fresh snapshot identity cannot steal an existing UNIQUE object key via REPLACE',()=>{
    const db=sqlite();db.exec(migrations[3]);book(db,'book',3);const before=db.prepare('SELECT * FROM cloud_books').all();
    try{db.prepare(books.replace('INSERT INTO','INSERT OR REPLACE INTO')).run('other',sha,3,'ready','books/book');}catch{/* Rejection is acceptable. */}
    expect(db.prepare('SELECT * FROM cloud_books').all()).toEqual(before);
    expect(db.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:3});
  });
  it('a fresh source identity cannot steal an existing UNIQUE original key via REPLACE',()=>{
    const db=sqlite();db.exec(migrations[3]);book(db,'book',3);db.prepare(originals).run('book','source',sha,5,'originals/source');
    const before=db.prepare('SELECT * FROM cloud_originals').all();
    try{db.prepare(originals.replace('INSERT INTO','INSERT OR REPLACE INTO')).run('book','other',sha,5,'originals/source');}catch{/* Rejection is acceptable. */}
    expect(db.prepare('SELECT * FROM cloud_originals').all()).toEqual(before);
    expect(db.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:8});
  });
});

describe('independent actual workerd D1 migration atomicity',()=>{
  let runtime:Miniflare;
  beforeAll(()=>{runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("synthetic");}}',compatibilityDate:'2026-01-01',d1Databases:['DB','OVER']}));});
  afterAll(async()=>{await runtime?.dispose();});
  it('native D1 applies migration transactionally and rolls back reservation + charge when later batch SQL fails',async()=>{
    const db=await runtime.getD1Database('DB');for(const sql of migrations)await db.batch(statements(sql).map(s=>db.prepare(s)));
    await db.prepare(books).bind('book',sha,3,'ready','books/book').run();
    await expect(db.batch([
      db.prepare(originals).bind('book','source',sha,5,'originals/source'),
      db.prepare(books).bind('invalid',sha,0,'ready','books/invalid')
    ])).rejects.toThrow();
    expect(await db.prepare('SELECT used_bytes FROM cloud_storage_budget').first('used_bytes')).toBe(3);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM cloud_originals').first('count')).toBe(0);
  },30_000);
  it('native D1 singleton replacement cannot lower charged reservation (confirmed REPLACE bypass)',async()=>{
    const db=await runtime.getD1Database('DB');
    try{await db.prepare('INSERT OR REPLACE INTO cloud_storage_budget VALUES(1,0)').run();}catch{/* Rejection is acceptable. */}
    expect(await db.prepare('SELECT used_bytes FROM cloud_storage_budget').first('used_bytes')).toBe(3);
  });
  it('native failed overbudget migration batch leaves legacy rows intact and no partially installed new schema',async()=>{
    const db=await runtime.getD1Database('OVER');for(const sql of migrations.slice(0,3))await db.batch(statements(sql).map(s=>db.prepare(s)));
    await db.batch(Array.from({length:269},(_,i)=>db.prepare(books).bind('old'+i,sha,33_554_432,i%2?'pending':'ready','books/'+i)));
    await expect(db.batch(statements(migrations[3]).map(s=>db.prepare(s)))).rejects.toThrow();
    expect(await db.prepare('SELECT COUNT(*) AS count FROM cloud_books').first('count')).toBe(269);
    expect(await db.prepare("SELECT name FROM sqlite_master WHERE name='cloud_storage_budget'").first()).toBeNull();
    // Old SUM guard itself rejects any further allocation from overbudget baseline.
    await db.prepare("INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) SELECT 'blocked','Review',?,1,'pending','books/blocked',1 WHERE COALESCE((SELECT SUM(bytes) FROM cloud_books),0)+1<=9000000000").bind(sha).run();
    expect(await db.prepare('SELECT COUNT(*) AS count FROM cloud_books').first('count')).toBe(269);
  },30_000);
});
