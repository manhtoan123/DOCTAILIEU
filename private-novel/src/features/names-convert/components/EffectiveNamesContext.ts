import {createContext} from 'react';
import type {NameEntry} from '../../../core/domain';
/** undefined = standalone consumer; null = App snapshot still loading. */
export const EffectiveNamesContext=createContext<Map<string,NameEntry[]>|null|undefined>(undefined);
