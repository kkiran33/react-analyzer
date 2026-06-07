import type { FileType, Language, TypeOverride } from '@/types/graph';

// Classify a Swift or Kotlin source file into the shared FileType taxonomy.
// Slots are reused with native meanings (see NATIVE_TYPE_LABELS in graph.ts):
//   page=Screen  component=reusable UI  hook=ViewModel/Presenter  store=State/Repo
//   service=Network/API  router=Coordinator/Navigation  config=app/DI/build  util=Model/Util
//
// Strategy: file/type *name* suffixes are a strong, unambiguous signal, so they
// win first (Phase A). Only when a name says nothing do we fall back to *content*
// heuristics (Phase B) — otherwise a ViewModel using @Published/StateFlow would be
// mis-tagged as a store, a ViewController doing URLSession as a service, etc.
export function classifyNative(
  path: string,
  name: string,
  content: string,
  language: Language,
  overrides?: TypeOverride,
): FileType {
  if (overrides) {
    for (const [pattern, type] of Object.entries(overrides)) {
      if (matchesPattern(path, pattern)) return type;
    }
  }

  const lp = path.toLowerCase();
  const ln = name.toLowerCase();
  const ends = (...s: string[]) => s.some((x) => ln.endsWith(x));
  const inDir = (...s: string[]) => s.some((x) => lp.includes(x));
  const has = (...s: string[]) => s.some((x) => content.includes(x));

  // ── Phase A: name / path signals (highest confidence) ───────────────────────

  if (
    inDir('/test/', '/tests/', '/androidtest/') ||
    ends('test', 'tests', 'spec') || name.startsWith('Test')
  ) return 'test';

  if (
    name === 'AppDelegate' || name === 'SceneDelegate' ||
    name === 'BuildConfig' || ln === 'mainapplication' ||
    ends('application', 'config', 'configuration', 'constants', 'environment', 'module')
  ) return 'config';

  if (
    ends('coordinator', 'router', 'route', 'routes', 'navigation',
         'navgraph', 'navhost', 'flowcontroller', 'deeplink', 'destinations') ||
    inDir('/navigation/', '/coordinator', '/routing/')
  ) return 'router';

  if (
    ends('viewmodel', 'presenter', 'interactor', 'usecase', 'vm') ||
    inDir('/viewmodel', '/usecase', '/presenter')
  ) return 'hook';

  if (
    ends('service', 'api', 'apiservice', 'client', 'network',
         'gateway', 'endpoint', 'remotedatasource') ||
    inDir('/network/', '/api/', '/remote/')
  ) return 'service';

  if (
    ends('repository', 'repo', 'store', 'state', 'reducer', 'manager',
         'datasource', 'cache', 'dao', 'database', 'prefs', 'datastore',
         'localdatasource', 'persistence', 'keychain') ||
    inDir('/store/', '/repository/', '/persistence/')
  ) return 'store';

  if (
    ends('viewcontroller', 'screen', 'page', 'activity', 'fragment', 'scene') ||
    inDir('/screens/', '/scenes/', '/pages/')
  ) return 'page';

  if (
    ends('cell', 'view', 'card', 'button', 'row', 'item', 'component',
         'widget', 'header', 'footer', 'badge', 'dialog') ||
    inDir('/components/', '/views/', '/ui/', '/widgets/')
  ) return 'component';

  if (
    ends('model', 'models', 'entity', 'dto', 'response', 'request', 'mapper',
         'formatter', 'validator', 'helper', 'helpers', 'util', 'utils',
         'extension', 'extensions', 'ext') ||
    inDir('/model/', '/models/', '/util', '/extensions/', '/domain/model')
  ) return 'util';

  // ── Phase B: content heuristics (name said nothing) ─────────────────────────

  if (language === 'swift' && /@main\b/.test(content) && /struct\s+\w+\s*:\s*App\b/.test(content)) {
    return 'config';
  }
  if (has('@HiltAndroidApp', '@dagger.Module', '@Provides')) return 'config';
  if (has('NavHost(', 'rememberNavController', 'findNavController')) return 'router';
  if (has('URLSession', 'Alamofire', 'import Moya', 'Retrofit', 'OkHttp',
          '@GET', '@POST', '@PUT', '@DELETE', 'import io.ktor')) return 'service';
  if (has('@Published', 'ObservableObject', 'UserDefaults', 'Keychain',
          '@Dao', '@Database', '@Entity', 'MutableStateFlow', 'StateFlow',
          'SharedPreferences')) return 'store';
  if (
    (language === 'swift' && /:\s*View\b/.test(content)) ||
    (language === 'kotlin' && has('@Composable'))
  ) return 'component';

  return 'util';
}

function matchesPattern(path: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, ' ')
    .replace(/\*/g, '[^/]*')
    .replace(/ /g, '.*');
  return new RegExp(`^${escaped}$`).test(path);
}
