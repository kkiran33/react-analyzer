# iOS / Swift Codebase Analyzer — Prompt

Entry-point card for analyzing a native iOS app written in Swift (UIKit, SwiftUI, or mixed).

Use this with Claude Code by running:
  `claude` inside the iOS repo → paste the prompt below, or save it as `CLAUDE.md` in the repo root.

The goal is a structured knowledge map detailed enough to **change the app safely, document it, or rebuild it on another technology** — so business rules and API contracts are captured first-class, not as an afterthought.

---

## PROMPT (copy everything below this line)

---

You are a senior iOS engineer and codebase analyst. Your job is to thoroughly read this Swift repository and produce a structured knowledge map that explains **what exists, how the app flows, what business rules it enforces, and how it talks to the outside world** — detailed enough that another team could rebuild it on a different stack from your output alone.

Work through the steps in order. Use your file-reading and search tools. Do not guess — read the actual files (`.swift`, `.h/.m` if any bridging, `.storyboard`, `.xib`, `Info.plist`, `*.xcodeproj/project.pbxproj`, `Package.swift`, `Podfile`, `*.entitlements`, `*.xcconfig`).

---

### STEP 1 — Project Shape & Build Setup

1. Identify the project type: `.xcodeproj` vs `.xcworkspace`, single app vs multi-module (SPM packages, embedded frameworks).
2. List every **target** (app, extensions, widgets, watch app, tests, UI tests) and every **scheme**.
3. List **build configurations** (Debug/Release/custom) and key flags from `.xcconfig` / build settings (deployment target, Swift version, feature flags, `OTHER_SWIFT_FLAGS`).
4. Dependency manager(s): SPM (`Package.swift` / `Package.resolved`), CocoaPods (`Podfile`/`Podfile.lock`), Carthage. List each third-party dependency + version + one-line purpose.
5. Note the overall **architecture pattern** if recognizable: MVC, MVVM, MVVM-C (coordinators), VIPER, Clean Architecture, TCA (The Composable Architecture), Redux-like.

Output format:
```
PROJECT
  workspace: <name>.xcworkspace   deployment: iOS 15.0   swift: 5.9   arch: MVVM-C
  targets:
    App            (main)       schemes: App-Dev, App-Prod
    NotificationSvc (extension)
    Tests / UITests
  dependencies (SPM):
    Alamofire 5.8      — networking
    Kingfisher 7.x     — image loading
  modules (local SPM/frameworks):
    CoreNetworking, DesignSystem, FeatureLogin
```

---

### STEP 2 — App Entry & Lifecycle

1. Find the entry point: `@main` `App` struct (SwiftUI), or `AppDelegate` + `SceneDelegate` (UIKit), or both.
2. Trace what happens on launch: dependency container setup, DI registration, root view/coordinator selection, environment/config loading, feature-flag fetch, analytics/crash-reporting init, push registration.
3. Identify how the **root flow** is decided (e.g. logged-in vs logged-out vs onboarding) and where that decision lives.
4. Note global app state holders (singletons, `@EnvironmentObject` roots, service locators, DI container).

Output format:
```
APP ENTRY
  entry: MyApp.swift (@main)  /  AppDelegate + SceneDelegate
  launch sequence:
    1. DIContainer.bootstrap()           AppDelegate.didFinishLaunching
    2. AnalyticsService.start()
    3. SessionStore.restore()            decides root: onboarding | login | home
  root decision: AppCoordinator.start()  src/App/AppCoordinator.swift
  global singletons: SessionStore, FeatureFlags, APIClient.shared
```

---

### STEP 3 — Navigation & Screen Flow  ⭐ (priority)

Map how the user moves through the app — this is the backbone for any rebuild.

1. Identify the navigation mechanism(s): UIKit `UINavigationController`/Coordinators, Storyboard segues, SwiftUI `NavigationStack`/`NavigationView`/`.sheet`/`.fullScreenCover`, TabBar, custom router.
2. List every **screen** and the transitions between them: which screen leads to which, on what trigger (button, deep link, push, timeout).
3. Capture **deep links / universal links / push-notification routes** (URL schemes from `Info.plist`, `onOpenURL`, `continue userActivity`) and where they land.
4. Note **guards**: auth checks, feature-flag gates, paywall gates blocking a transition.

Output format:
```
SCREEN FLOW
  [Launch] → SplashVC → (session?) → HomeVC | LoginVC
  LoginVC → (login success) → HomeVC
  HomeVC ──tap "Profile"──▶ ProfileVC
  HomeVC ──tap item──▶ DetailVC(id)         guarded: requires login
  DetailVC ──"Buy"──▶ CheckoutVC            guarded: feature-flag `checkout_v2`, paywall

DEEP LINKS
  myapp://product/{id}   → DetailVC(id)      handler: AppCoordinator.handle(url:)
  universal: /order/{id} → OrderStatusVC
  push: {type:"promo"}   → PromoVC
```

---

### STEP 4 — Screens / Views Catalog

For each screen (UIViewController, SwiftUI View, or VIPER module):
- Name + file path
- Type: screen-level vs reusable component
- What it displays (one sentence)
- Which ViewModel/Presenter/Interactor it binds to
- Key user actions it exposes and what each triggers
- Data it reads (store, service, injected dependency)

Output as a grouped tree:
```
SCREENS
  Feature: Authentication
    LoginVC.swift             [screen]  email/password form → AuthViewModel
        actions: tapLogin → vm.login(), tapForgot → ForgotPasswordVC
    OnboardingView.swift      [screen]  3-page intro → OnboardingViewModel
  Feature: Catalog
    HomeViewController.swift  [screen]  product grid → HomeViewModel  reads: ProductService
    ProductCell.swift         [component] props: Product
```

---

### STEP 5 — ViewModels / Presenters / Interactors (Logic Layer)

For each ViewModel/Presenter/Interactor/Reducer:
- Name + file path + which screen(s) it serves
- Inputs (user intents / methods) and Outputs (published state, delegate callbacks)
- The **logic it performs** — validation, transformation, branching, orchestration of services
- Dependencies it is injected with

```
LOGIC LAYER
  AuthViewModel.swift   serves: LoginVC
    inputs:  login(email,password), validateEmail()
    outputs: @Published state: .idle/.loading/.error(msg)/.success
    logic:   trims+lowercases email; rejects empty password;
             on 401 maps to "Invalid credentials"; stores token via SessionStore
    deps:    AuthService, SessionStore, Validator
```

---

### STEP 6 — State Management

1. Identify the state approach: Combine (`@Published`/`ObservableObject`/`PassthroughSubject`), SwiftUI `@State`/`@StateObject`/`@EnvironmentObject`, TCA store/reducer, Redux-like, plain delegates/closures, async/await streams.
2. List the **shared/global state** holders: what they hold, who mutates them, who observes them.
3. Note persistence-backed state (anything restored from Keychain/UserDefaults/DB on launch).
4. Flag state shared across modules or screens via singletons.

```
STATE
  SessionStore (ObservableObject, singleton)
    state: { user: User?, token: String?, isLoggedIn: Bool }
    mutated by: AuthViewModel.login/logout
    observed by: AppCoordinator, ProfileViewModel
    persisted: token → Keychain, user → UserDefaults
  CartStore (TCA)
    state: { items:[Item], total:Decimal }   actions: add, remove, clear
```

---

### STEP 7 — Business Rules & Domain Logic  ⭐⭐ (highest priority)

This is the most important section for a rebuild. Hunt down every rule the app enforces that is **not** just UI plumbing. Look in ViewModels, Interactors, `Domain/`, `UseCases/`, `Services/`, `Models/`, validators, formatters, and any `if/guard/switch` that encodes a policy.

For each rule capture: where it lives, the condition, and the consequence.

Cover at minimum:
- **Validation rules** (field formats, min/max, required fields, regexes)
- **Calculations** (prices, totals, taxes, discounts, scores, units, dates)
- **Authorization / eligibility** (who can see/do what; role/tier/age gates)
- **State machines / status transitions** (order states, KYC steps, allowed transitions)
- **Feature flags / A-B logic** that changes behavior
- **Error & retry policies** (what is retried, backoff, what surfaces to the user)
- **Edge cases & defaults** (empty states, fallbacks, time-zone/locale handling)

```
BUSINESS RULES
  Validation
    Password: ≥8 chars, ≥1 digit, ≥1 uppercase   Validator.swift:42
    Phone:    E.164, country from locale          PhoneValidator.swift
  Pricing
    total = Σ(item.price × qty) − discount + tax
    tax = subtotal × region.rate (rates in TaxTable.swift)   CartViewModel.swift:88
    discount: code "WELCOME10" → 10% if first order only
  Eligibility
    Checkout requires verified email AND age ≥ 18    CheckoutGuard.swift
  Order state machine
    created → paid → shipped → delivered ; cancel only before shipped
  ⚠️ Rule with no test coverage / looks fragile: <note it>
```

---

### STEP 8 — API & Networking Integration  ⭐⭐ (highest priority)

Find every place the app talks to a backend: `URLSession`, Alamofire, Moya, Apollo/GraphQL, gRPC, WebSocket/socket.io, third-party SDK calls (Firebase, Stripe, Auth0, analytics).

For each API surface capture:
- Networking stack and where requests are built (router/endpoint enum, service class)
- Base URL(s) per environment and where they are configured
- Auth scheme (Bearer/OAuth/API key) and how tokens are attached & refreshed
- Every endpoint: METHOD + path, request params/body, response model, error handling
- Request/response **DTO ↔ domain model mapping** (Codable structs)

```
API
  stack: Alamofire + Codable, central APIClient.swift
  base URLs: Dev https://dev.api.x.com  Prod https://api.x.com   (AppConfig.swift / xcconfig)
  auth: Bearer token from SessionStore; 401 → AuthInterceptor refreshes via POST /auth/refresh

  AuthService.swift
    POST /auth/login        body {email,password}        → {token, user}      maps→ User
    POST /auth/refresh      body {refreshToken}           → {token}
  ProductService.swift
    GET  /products?page=&q= →  [ProductDTO]               maps→ Product
    GET  /products/{id}     →  ProductDetailDTO           maps→ ProductDetail

  3rd-party integrations:
    Stripe  — PaymentService.swift, publishable key in xcconfig, confirms PaymentIntent
    Firebase Analytics / Remote Config (feature flags)
```

---

### STEP 9 — Persistence & Local Storage

List every local storage mechanism and what it holds:
- Core Data / SwiftData / Realm / SQLite (entities + relationships, migration notes)
- UserDefaults keys (what + why)
- Keychain items (tokens, credentials)
- File/cache storage (images, downloads, offline data)
- Sync strategy (offline-first? cache invalidation? source of truth?)

```
PERSISTENCE
  Core Data — model.xcdatamodeld
    Product(id, name, price)  1—* CartItem
    sync: server is source of truth; local cache refreshed on launch + pull-to-refresh
  Keychain: authToken, refreshToken
  UserDefaults: hasSeenOnboarding, selectedTheme, lastSyncDate
```

---

### STEP 10 — Cross-Cutting Concerns

Document the platform/infrastructure features:
- **Auth & session** end-to-end (login → token store → attach → refresh → logout/expiry)
- **Push notifications** (registration, payload types → routes, handlers)
- **Permissions** (camera, location, notifications, photos — where requested, rationale strings)
- **Analytics & logging** (events tracked, where fired)
- **Crash reporting / monitoring**
- **Localization** (`.strings`/String Catalogs, supported languages)
- **Accessibility** (notable VoiceOver/Dynamic Type handling)
- **Background work** (background tasks, silent push, refresh)
- **Security** (cert pinning, jailbreak detection, biometric/FaceID gating)

```
CROSS-CUTTING
  Auth:   login → Keychain(token) → AuthInterceptor attaches Bearer → refresh on 401 → logout clears Keychain+stores
  Push:   APNs registered in AppDelegate; {type} routes via NotificationRouter
  Perms:  camera (scan), location (store finder)   rationale in Info.plist
  Analytics: Firebase — events: login, view_product, add_to_cart, purchase
  Localized: en, es, fr   Biometric: FaceID gate on app resume (optional)
```

---

### STEP 11 — Module / Feature Summary Cards

For each major feature or module, write a short card (5–10 bullets):
- Business domain it owns
- Entry screen + main ViewModel
- Screens/flows it contains
- State it depends on
- APIs it calls
- Business rules it enforces (reference Step 7 entries)
- What it shares with / depends on from other modules
- Anything worth flagging (deprecated APIs, force-unwraps, massive view controllers, no tests, TODO/FIXME clusters) ⚠️

---

### STEP 12 — Quick-Reference Index

A flat "where do I find X?" lookup:
```
QUICK INDEX
  App entry / launch      AppDelegate.swift, MyApp.swift, AppCoordinator.swift
  Navigation / routing    AppCoordinator.swift, Coordinators/, deep links: SceneDelegate
  Auth flow               AuthService.swift, AuthViewModel.swift, SessionStore.swift
  API base URLs / config  AppConfig.swift, *.xcconfig, Info.plist
  Networking core         APIClient.swift, Endpoint enums, Interceptors/
  Business rules          Domain/, UseCases/, Validators/, *ViewModel.swift
  Persistence             model.xcdatamodeld, KeychainStore.swift, Defaults.swift
  Feature flags           FeatureFlags.swift, Firebase Remote Config
  Design system           DesignSystem/ package, Colors/Typography
```

---

### OUTPUT RULES

- Use the exact section headers and code-block formats above so the output is scannable.
- If a section does not apply, write `(none found)` — do not skip it.
- **Steps 3, 7, and 8 (flow, business rules, APIs) are the priority** — be exhaustive there even if other sections are terse.
- Quote `file.swift:line` references so an engineer can jump straight to the source.
- Flag bugs, dead code, force-unwraps, retain cycles, or anti-patterns with `⚠️`.
- Keep descriptions short and factual. A senior engineer who has never seen this app will read it cold and must be able to rebuild from it.
- If the repo is large, finish all steps before summarizing — do not truncate early.
