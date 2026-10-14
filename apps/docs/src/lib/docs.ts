import { spreadsheetViewerDoc } from './docs/spreadsheet-viewer';
import { powerpointViewerDoc } from './docs/powerpoint-viewer';
import { installationDoc } from './docs/installation';
import { architectureDoc } from './docs/architecture';
import { developmentDoc } from './docs/development';
import { wordDoc } from './docs/word';
import { wordEditingDoc } from './docs/word-editing';
import { nativeWordDoc } from './docs/native-word';
import { wordFormattingDoc } from './docs/word-formatting';
import { wordListsDoc } from './docs/word-lists';
import { wordTablesDoc } from './docs/word-tables';
import { wordDrawingsDoc } from './docs/word-drawings';
import { wordLayoutDoc } from './docs/word-layout';
import { wordStoriesDoc } from './docs/word-stories';
import { wordCollaborationDoc } from './docs/word-collaboration';
import { wordSearchDoc } from './docs/word-search';
import { wordPerformanceDoc } from './docs/word-performance';
import { wordSupportDoc } from './docs/word-support';
import { spreadsheetsDoc } from './docs/spreadsheets';
import { spreadsheetEditingDoc } from './docs/spreadsheet-editing';
import { spreadsheetSupportDoc } from './docs/spreadsheet-support';
import { powerpointDoc } from './docs/powerpoint';
import { powerpointNavigationDoc } from './docs/powerpoint-navigation';
import { powerpointEditingDoc } from './docs/powerpoint-editing';
import { powerpointExportDoc } from './docs/powerpoint-export';
import { powerpointSupportDoc } from './docs/powerpoint-support';
import { compatibilityDoc } from './docs/compatibility';
import { compatibilityReportsDoc } from './docs/compatibility-reports';
import { releasesDoc } from './docs/releases';
import type { Doc } from './docs/types';

export const docs: Record<string, Doc> = {
  "installation": installationDoc,
  "architecture": architectureDoc,
  "development": developmentDoc,
  "word": wordDoc,
  "word-editing": wordEditingDoc,
  "native-word": nativeWordDoc,
  "word-formatting": wordFormattingDoc,
  "word-lists": wordListsDoc,
  "word-tables": wordTablesDoc,
  "word-drawings": wordDrawingsDoc,
  "word-layout": wordLayoutDoc,
  "word-stories": wordStoriesDoc,
  "word-collaboration": wordCollaborationDoc,
  "word-search": wordSearchDoc,
  "word-performance": wordPerformanceDoc,
  "word-support": wordSupportDoc,
  "spreadsheets": spreadsheetsDoc,
  "spreadsheet-viewer": spreadsheetViewerDoc,
  "spreadsheet-editing": spreadsheetEditingDoc,
  "spreadsheet-support": spreadsheetSupportDoc,
  "powerpoint": powerpointDoc,
  "powerpoint-viewer": powerpointViewerDoc,
  "powerpoint-navigation": powerpointNavigationDoc,
  "powerpoint-editing": powerpointEditingDoc,
  "powerpoint-export": powerpointExportDoc,
  "powerpoint-support": powerpointSupportDoc,
  "compatibility": compatibilityDoc,
  "compatibility-reports": compatibilityReportsDoc,
  "releases": releasesDoc,
  "word-authoring": wordDoc,
};
