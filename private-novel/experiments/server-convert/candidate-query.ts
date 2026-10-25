// SQLite generates the same code-point substrings as JS, bounded by UTF-16 units.
// This mode is only used with no Rules; dependency discovery retains the JS path.
export const candidateSql=`WITH RECURSIVE
 characters AS MATERIALIZED (
  SELECT v.key AS variant,c.key AS pos,c.value AS value,
   CASE WHEN unicode(c.value)>65535 THEN 2 ELSE 1 END AS units
  FROM json_each(?) v CROSS JOIN json_each(v.value) c
 ),
 suffixes AS MATERIALIZED (
  SELECT DISTINCT json_group_array(value) OVER (
   PARTITION BY variant ORDER BY pos ROWS BETWEEN CURRENT ROW AND ? FOLLOWING
  ) AS chars FROM characters
 ),
 spans(chars,pos,value,units) AS (
  SELECT chars,0,json_extract(chars,'$[0]'),
   CASE WHEN unicode(json_extract(chars,'$[0]'))>65535 THEN 2 ELSE 1 END
  FROM suffixes WHERE CASE WHEN unicode(json_extract(chars,'$[0]'))>65535 THEN 2 ELSE 1 END<=?
  UNION ALL
  SELECT chars,pos+1,value||json_extract(chars,'$['||(pos+1)||']'),
   units+CASE WHEN unicode(json_extract(chars,'$['||(pos+1)||']'))>65535 THEN 2 ELSE 1 END
  FROM spans WHERE pos+1<json_array_length(chars)
   AND units+CASE WHEN unicode(json_extract(chars,'$['||(pos+1)||']'))>65535 THEN 2 ELSE 1 END<=?
 ),
 candidates(value) AS MATERIALIZED (SELECT DISTINCT value FROM spans LIMIT 8193),
 budget AS MATERIALIZED (SELECT count(*) AS candidate_count FROM candidates),
 eligible(value) AS (SELECT value FROM candidates,budget WHERE candidate_count<=8192)`;

export const matchedSql=(packed:boolean)=>packed?
 `SELECT json_extract(e.value,'$[0]') AS source_key,json_extract(e.value,'$[1]') AS kind,json_extract(e.value,'$[2]') AS value,json_extract(e.value,'$[3]') AS ordinal
 FROM eligible q CROSS JOIN probe_buckets b ON b.id=((unicode(substr(q.value,1,1))*31+coalesce(unicode(substr(q.value,2,1)),0))%4096) AND b.first_key<=q.value AND b.last_key>=q.value
 CROSS JOIN json_each(json_extract(b.payload,'$.'||json_quote(q.value))) e ORDER BY ordinal LIMIT ?`:
 'SELECT d.source_key,d.kind,d.value,d.ordinal FROM eligible q CROSS JOIN probe_dictionary d ON d.lookup_key=q.value ORDER BY d.ordinal LIMIT ?';
