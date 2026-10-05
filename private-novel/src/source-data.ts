import type {SourceFile} from './domain';

// Older compact restores stored an empty Blob without a missing-data marker.
// Accept legacy real files, but never use metadata-only rows to suppress imports.
export function hasUsableSourceData(source:SourceFile):boolean {
  return source.dataStatus!=='missing'&&source.blob.size===source.bytes;
}

export function usableSourceHashes(sources:SourceFile[]):Set<string> {
  return new Set(sources.filter(hasUsableSourceData).map(source=>source.sha256));
}
