/**
 * Storybook only, imported first in .storybook/preview.tsx: the API client captures `fetch`
 * when it's created, so the stand-in library must be in place before any module loads it.
 */
import { installStandInFetch } from './file-fixtures';

installStandInFetch();
