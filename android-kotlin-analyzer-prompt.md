# Android / Kotlin Codebase Analyzer — Prompt

Entry-point card for analyzing a native Android app written in Kotlin (Jetpack Compose, View/XML, or mixed).

Use this with Claude Code by running:
  `claude` inside the Android repo → paste the prompt below, or save it as `CLAUDE.md` in the repo root.

The goal is a structured knowledge map detailed enough to **change the app safely, document it, or rebuild it on another technology** — so business rules and API contracts are captured first-class, not as an afterthought.

---

## PROMPT (copy everything below this line)

---

You are a senior Android engineer and codebase analyst. Your job is to thoroughly read this Kotlin repository and produce a structured knowledge map that explains **what exists, how the app flows, what business rules it enforces, and how it talks to the outside world** — detailed enough that another team could rebuild it on a different stack from your output alone.

Work through the steps in order. Use your file-reading and search tools. Do not guess — read the actual files (`.kt`, `.java` if any, `AndroidManifest.xml`, `build.gradle(.kts)`, `settings.gradle(.kts)`, `gradle/libs.versions.toml`, `res/` layouts & navigation graphs, `proguard-rules.pro`, `*.properties`).

---

### STEP 1 — Project Shape & Build Setup

1. List every **Gradle module** (`:app`, `:core`, `:feature-*`, `:data`, `:domain`, etc.) from `settings.gradle`. Identify the module graph (who depends on whom).
2. From `build.gradle(.kts)` and `libs.versions.toml`: min/target/compile SDK, Kotlin version, Compose vs Views (or both), Java version.
3. **Build variants**: buildTypes (debug/release) and productFlavors (dev/staging/prod, free/paid). Note `buildConfigField`s, signing, and `BuildConfig` flags.
4. Dependencies: list each significant library + version + one-line purpose (Retrofit, OkHttp, Hilt/Dagger/Koin, Room, Coroutines/Flow, Compose, Navigation, WorkManager, Coil/Glide, etc.).
5. Note the **architecture pattern**: MVVM, MVI, Clean Architecture (domain/data/presentation layering), single- vs multi-module.

Output format:
```
PROJECT
  modules: :app → :feature-login, :feature-home → :domain → :data → :core
  sdk: min 24 / target 34   kotlin 1.9   UI: Compose   arch: MVVM + Clean (multi-module)
  variants: buildTypes[debug,release] × flavors[dev,staging,prod]
  dependencies:
    Retrofit 2.9 + OkHttp     — networking
    Hilt 2.48                 — DI
    Room 2.6                  — local db
    Jetpack Navigation Compose— navigation
    Coroutines/Flow           — async/state
```

---

### STEP 2 — App Entry & Lifecycle

1. Find the `Application` class (`@HiltAndroidApp` etc.) and what it initializes on startup (DI graph, logging, crash reporting, analytics, WorkManager, feature-flag fetch, Timber).
2. From `AndroidManifest.xml`: the launcher Activity, all declared Activities/Services/Receivers/Providers, permissions, intent filters (deep links), `exported` flags.
3. Identify the **entry Activity** (often single `MainActivity` hosting Compose/NavHost) and how the **root destination** is chosen (logged-in vs onboarding vs login).
4. Note application-scoped singletons / DI-provided global state.

Output format:
```
APP ENTRY
  Application: MyApp.kt (@HiltAndroidApp)
    init: Hilt graph, Timber, Firebase, WorkManager, RemoteConfig.fetch()
  launcher: MainActivity (single-activity, hosts NavHost)
  root decision: based on SessionRepository.isLoggedIn → "home" else "login"
  manifest permissions: INTERNET, CAMERA, ACCESS_FINE_LOCATION, POST_NOTIFICATIONS
```

---

### STEP 3 — Navigation & Screen Flow  ⭐ (priority)

Map how the user moves through the app — backbone for any rebuild.

1. Identify the navigation mechanism: Jetpack Navigation (Compose `NavHost`/routes or XML `nav_graph.xml`), Fragments + FragmentManager, multiple Activities, or a custom navigator.
2. List every **destination/screen** and the transitions: which screen leads to which, on what trigger (click, deep link, push, result).
3. Capture **deep links** (manifest `intent-filter` / `navDeepLink`), App Links, and **push-notification routes** and where they land.
4. Note **guards**: auth checks, feature-flag gates, permission gates blocking a transition.
5. Note nav arguments passed between destinations.

Output format:
```
SCREEN FLOW
  [Launch] → SplashScreen → (session?) → HomeScreen | LoginScreen
  LoginScreen → (success) → HomeScreen
  HomeScreen ──tap "Profile"──▶ ProfileScreen
  HomeScreen ──tap item──▶ DetailScreen(itemId)        guarded: requires login
  DetailScreen ──"Buy"──▶ CheckoutScreen               guarded: flag `checkout_v2`

NAV GRAPH (routes)
  "home", "detail/{id}", "checkout", "profile"

DEEP LINKS
  myapp://product/{id}   → DetailScreen        intent-filter in manifest
  https://x.com/order/{id} (App Link) → OrderStatusScreen
  push {type:"promo"}    → PromoScreen          NotificationHandler.kt
```

---

### STEP 4 — Screens / UI Catalog

For each screen (Composable screen, Fragment, or Activity):
- Name + file path
- Type: screen-level vs reusable component
- What it displays (one sentence)
- Which ViewModel it collects state from
- Key user actions it exposes and what each triggers
- State it observes (StateFlow/LiveData) and events it sends

Output as a grouped tree:
```
SCREENS
  Feature: Authentication
    LoginScreen.kt            [screen]  email/password form → LoginViewModel
        actions: onLogin → vm.login(), onForgot → nav("forgot")
    OnboardingScreen.kt       [screen]  3-page intro → OnboardingViewModel
  Feature: Catalog
    HomeScreen.kt             [screen]  product grid → HomeViewModel  state: HomeUiState
    ProductCard.kt            [component] params: Product, onClick
```

---

### STEP 5 — ViewModels / Presenters (Logic Layer)

For each ViewModel (or Presenter/MVI reducer):
- Name + file path + which screen(s) it serves
- UI state model it exposes (`UiState` data class / sealed class) and events/intents it accepts
- The **logic it performs** — validation, transformation, branching, orchestration of use cases/repositories
- Dependencies injected

```
LOGIC LAYER
  LoginViewModel.kt   serves: LoginScreen
    state:  StateFlow<LoginUiState{ loading, error?, success }>
    intents: login(email,password), onEmailChange()
    logic:  trims+lowercases email; rejects blank password;
            maps HttpException 401 → "Invalid credentials"; saves token via SessionRepository
    deps:   LoginUseCase, SessionRepository  (Hilt-injected)
```

---

### STEP 6 — State Management

1. Identify the state approach: Kotlin `StateFlow`/`SharedFlow`, LiveData, Compose `state`/`remember`/`collectAsStateWithLifecycle`, MVI store, RxJava.
2. List **shared/app-scoped state** holders (singletons, repositories holding observable state): what they hold, who mutates, who observes.
3. Note persistence-backed state restored on launch (DataStore/SharedPreferences/Room/EncryptedSharedPreferences).
4. Flag state shared across feature modules.

```
STATE
  SessionRepository (@Singleton)
    state: StateFlow<Session{ user:User?, token:String?, isLoggedIn:Bool }>
    mutated by: LoginUseCase / logout()
    observed by: MainActivity (root route), ProfileViewModel
    persisted: token → EncryptedSharedPreferences, user → DataStore
  CartRepository
    state: StateFlow<List<CartItem>>   ops: add, remove, clear
```

---

### STEP 7 — Business Rules & Domain Logic  ⭐⭐ (highest priority)

The most important section for a rebuild. Hunt down every rule the app enforces that is **not** just UI plumbing. Look in the `domain/` layer, `usecase`/`interactor` classes, repositories, ViewModels, mappers, validators, and any `if/when/require/check` encoding a policy.

For each rule capture: where it lives, the condition, and the consequence.

Cover at minimum:
- **Validation rules** (field formats, min/max, required, regex)
- **Calculations** (prices, totals, taxes, discounts, scores, units, dates)
- **Authorization / eligibility** (role/tier/age gates; who can do what)
- **State machines / status transitions** (order states, KYC steps, allowed transitions)
- **Feature flags / A-B logic** (RemoteConfig, BuildConfig) that changes behavior
- **Error & retry policies** (what is retried, backoff, what surfaces to the user)
- **Edge cases & defaults** (empty states, fallbacks, locale/timezone handling)

```
BUSINESS RULES
  Validation
    Password: ≥8 chars, ≥1 digit, ≥1 uppercase    Validators.kt:30
    Phone:    E.164, country from Locale            PhoneValidator.kt
  Pricing
    total = items.sumOf { price * qty } - discount + tax
    tax = subtotal * region.rate (TaxTable.kt)      CartUseCase.kt:55
    discount: code "WELCOME10" → 10% if firstOrder
  Eligibility
    Checkout requires verifiedEmail && age >= 18    CheckoutEligibility.kt
  Order state machine
    CREATED → PAID → SHIPPED → DELIVERED ; cancel only before SHIPPED
  ⚠️ Rule with no test coverage / fragile: <note it>
```

---

### STEP 8 — API & Networking Integration  ⭐⭐ (highest priority)

Find every place the app talks to a backend: Retrofit/OkHttp, Ktor, Apollo/GraphQL, gRPC, WebSocket, Firebase, third-party SDKs (Stripe, Auth0, analytics).

For each API surface capture:
- Networking stack and where requests are defined (Retrofit `interface` services, Ktor client)
- Base URL(s) per flavor/environment and where configured (`BuildConfig`, gradle, DI module)
- Auth scheme (Bearer/OAuth/API key) and how tokens are attached & refreshed (OkHttp `Interceptor`/`Authenticator`)
- Every endpoint: METHOD + path, request params/body, response DTO, error handling
- **DTO ↔ domain model mapping** (mappers, `@Serializable`/Moshi/Gson models)

```
API
  stack: Retrofit + OkHttp + Moshi; NetworkModule.kt (Hilt) provides clients
  base URLs: dev https://dev.api.x.com / prod https://api.x.com  (BuildConfig per flavor)
  auth: AuthInterceptor adds Bearer from SessionRepository; TokenAuthenticator refreshes on 401 via POST /auth/refresh

  AuthApi.kt (Retrofit interface)
    POST /auth/login       @Body LoginRequest        → LoginResponse  → maps User
    POST /auth/refresh     @Body RefreshRequest      → TokenResponse
  ProductApi.kt
    GET  /products?page=&q=                          → List<ProductDto> → Product
    GET  /products/{id}                              → ProductDetailDto → ProductDetail

  3rd-party:
    Stripe — PaymentRepository.kt, key in BuildConfig, confirms PaymentIntent
    Firebase Analytics / RemoteConfig (feature flags)
```

---

### STEP 9 — Persistence & Local Storage

List every local storage mechanism and what it holds:
- Room (entities, DAOs, relationships, migrations) / SQLite / Realm
- DataStore (Preferences or Proto) / SharedPreferences keys
- EncryptedSharedPreferences / Keystore (tokens, credentials)
- File/cache storage (images, downloads, offline data)
- Sync strategy (offline-first? single source of truth? cache invalidation?)

```
PERSISTENCE
  Room — AppDatabase
    ProductEntity(id, name, price)  1—* CartItemEntity   DAOs: ProductDao, CartDao
    migrations: 1→2 added column `discount`
    sync: server source of truth; Room is offline cache, refreshed on launch + pull-to-refresh
  EncryptedSharedPreferences: authToken, refreshToken
  DataStore: hasSeenOnboarding, themeMode, lastSyncDate
```

---

### STEP 10 — Cross-Cutting Concerns

Document platform/infrastructure features:
- **Auth & session** end-to-end (login → token store → attach → refresh → logout/expiry)
- **Push notifications** (FCM token, `FirebaseMessagingService`, payload types → routes)
- **Permissions** (camera, location, notifications — where requested, runtime handling)
- **Background work** (WorkManager workers, foreground/background services, AlarmManager)
- **Analytics & logging** (events tracked, where fired; Timber)
- **Crash reporting / monitoring** (Crashlytics)
- **Localization** (`res/values-*/strings.xml`, supported languages)
- **Accessibility** (contentDescription / TalkBack handling)
- **Security** (cert pinning, ProGuard/R8 rules, root detection, Biometric prompt)

```
CROSS-CUTTING
  Auth:   login → EncryptedPrefs(token) → AuthInterceptor Bearer → TokenAuthenticator refresh → logout clears prefs+db
  Push:   FCM, MyFirebaseMessagingService → NotificationHandler routes by {type}
  Perms:  CAMERA (scan), FINE_LOCATION (store finder), POST_NOTIFICATIONS (13+)
  Background: SyncWorker (WorkManager, periodic 6h)
  Analytics: Firebase — login, view_product, add_to_cart, purchase
  Localized: en, es, fr   Biometric: BiometricPrompt gate on resume (optional)
```

---

### STEP 11 — Module / Feature Summary Cards

For each feature module, write a short card (5–10 bullets):
- Business domain it owns
- Entry screen + main ViewModel
- Screens/flows it contains
- State it depends on
- APIs it calls
- Business rules it enforces (reference Step 7 entries)
- What it shares with / depends on from other modules
- Anything worth flagging (deprecated APIs, `!!` non-null asserts, God Activities/ViewModels, no tests, TODO/FIXME clusters) ⚠️

---

### STEP 12 — Quick-Reference Index

A flat "where do I find X?" lookup:
```
QUICK INDEX
  App entry / launch      MyApp.kt, MainActivity.kt, AndroidManifest.xml
  Navigation / routing    NavGraph.kt / nav_graph.xml, deep links: manifest
  Auth flow               AuthApi.kt, LoginUseCase.kt, SessionRepository.kt, AuthInterceptor.kt
  API base URLs / config  build.gradle (buildConfigField), NetworkModule.kt
  Networking core         NetworkModule.kt, *Api.kt interfaces, Interceptors/
  Business rules          domain/usecase/, Validators.kt, *ViewModel.kt
  Persistence             AppDatabase.kt, DAOs, DataStore/, EncryptedPrefs
  DI graph                di/ modules (Hilt), MyApp.kt
  Feature flags           RemoteConfig wrapper, BuildConfig
  Design system           :core-ui / theme/ (Compose theme)
```

---

### OUTPUT RULES

- Use the exact section headers and code-block formats above so the output is scannable.
- If a section does not apply, write `(none found)` — do not skip it.
- **Steps 3, 7, and 8 (flow, business rules, APIs) are the priority** — be exhaustive there even if other sections are terse.
- Quote `File.kt:line` references so an engineer can jump straight to the source.
- Flag bugs, dead code, `!!` non-null asserts, leaked coroutines/contexts, or anti-patterns with `⚠️`.
- Keep descriptions short and factual. A senior engineer who has never seen this app will read it cold and must be able to rebuild from it.
- If the repo is large, finish all steps before summarizing — do not truncate early.
