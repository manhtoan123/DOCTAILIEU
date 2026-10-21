import type {AlbumNode} from '../services/album-tree';
import {ConvertedTitle} from '../../names-convert/components/ConvertedTitle';

interface AlbumShelfProps {
  albums: AlbumNode[];
  heading: string;
  onSelect: (name: string) => void;
}

// Nhận danh sách đã chuẩn bị từ App; không đọc database trong component này.
export function AlbumShelf({albums, heading, onSelect}: AlbumShelfProps) {
  return (
    <section className="album-shelf-section" aria-label="Danh sách Album">
      <div className="section-heading">
        <h2>{heading} ({albums.length})</h2>
      </div>
      <div className="album-card-grid">
        {albums.map(album => {
          const {path,name,bookCount,children}=album;
          return (
            <div key={path} className="album-card-wrap">
              <button
                type="button"
                className="album-card-item"
                onClick={() => onSelect(path)}
                aria-label={`Mở Album ${path}`}
              >
                <span className="album-card-icon" aria-hidden="true">📁</span>
                <div className="album-card-info">
                  <strong><ConvertedTitle text={name} bookId="" showOriginal/></strong>
                  <small>{bookCount} truyện{children.length>0&&` · ${children.length} Album con`}</small>
                </div>
                <span className="album-card-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
