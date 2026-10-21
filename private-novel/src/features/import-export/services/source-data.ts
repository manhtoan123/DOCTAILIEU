import type {SourceFile} from '../../../core/domain';
import {originalByteLimit} from '../../sync-cloud/services/cloud-original-schema';

// Older compact restores stored an empty Blob without a missing-data marker.
// Accept legacy real files, but never use metadata-only rows to suppress imports.
export function hasUsableSourceData(source:SourceFile):boolean {
  return source.dataStatus!=='missing'&&source.blob.size===source.bytes;
}

/** A local original can be downloaded when its complete bytes pass the per-encoding limit. */
export function usableLocalOriginal(source:SourceFile|undefined):source is SourceFile {
  return !!source&&hasUsableSourceData(source)&&source.bytes>0&&source.bytes<=originalByteLimit(source.encoding)&&/^[a-f0-9]{64}$/.test(source.sha256);
}

export function usableSourceHashes(sources:SourceFile[]):Set<string> {
  return new Set(sources.filter(hasUsableSourceData).map(source=>source.sha256));
}
