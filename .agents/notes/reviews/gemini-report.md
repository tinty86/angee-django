### Summary
The `angee.base` addon forms a sophisticated but overly complex foundation for the framework. Its core function is to compose other Django apps at build time, generating concrete models, GraphQL schemas, and resource manifests from abstract source definitions. The overall health is mixed: while deterministic ordering, CI checks, and transactional integrity are well-handled, the implementation suffers from fighting its underlying frameworks. The single biggest structural problem is the code generation and model composition logic, which bypasses or reconstructs Django's own mechanisms using brittle string manipulation and complex MRO introspection. This violates the project's own "Django-Native Rule," creating a high maintenance burden and moving away from the goal of being a "thin" composition layer.

### Findings

1.  
    - **Title**: Build-time behavior depends on fragile `sys.argv` inspection.
    - **Dimension(s)**: Architecture, Code decomposition
    - **Location**: `src/angee/base/apps.py:33`
    - **Severity**: Critical
    - **Problem**: The `_running_angee_build` function inspects `sys.argv` to determine if the code is running within the `angee build` command. This creates a hidden, fragile coupling between the app loading mechanism and the command-line invocation. It makes the code's behavior dependent on an external, implicit context, violating the principle of clear and explicit inputs. This is a "red flag" as described in `docs/guidelines.md`.
    - **Recommendation**: Replace the `sys.argv` check with an explicit mechanism. For instance, the build process could set a temporary environment variable or a configuration flag that is passed down through the call stack, making the dependency on the build context explicit.

2.  
    - **Title**: Model composition logic rebuilds Django features with brittle code generation.
    - **Dimension(s)**: Architecture, Code decomposition, DRY
    - **Location**: `src/angee/base/compose/emission.py:165`
    - **Severity**: High
    - **Problem**: The `_models_source` function generates Python code for concrete models as strings. It manually reconstructs the `class Meta` by copying attributes (`db_table`, REBAC settings) from the abstract source model's `_meta`. This violates the "Django-Native Rule" (`docs/backend/guidelines.md`) by re-implementing functionality that Django's model metaclass and inheritance are designed to handle. It is brittle; if a library adds a new `Meta` option, the composer must be updated to copy it.
    - **Recommendation**: Simplify model composition to be more Django-native. Instead of generating full model classes as strings, dynamically create the model classes using `type()` and a dynamic `Meta` class at build time *before* emitting files. This would leverage Django's own machinery for inheritance and `Meta` attribute processing, making the composer simpler and more robust.

3.  
    - **Title**: Global state used for resource ledger model.
    - **Dimension(s)**: Architecture, Code decomposition
    - **Location**: `src/angee/base/resources/widgets.py:12`
    - **Severity**: High
    - **Problem**: The `_active_ledger_model` global variable is used to pass the concrete `Resource` model into the `django-import-export` widget context. This creates hidden global state, making the resource loading subsystem difficult to reason about and unsafe for any potential concurrent execution. It violates the principle of functions operating on their inputs, not on a hidden global context.
    - **Recommendation**: Refactor the resource loading process to pass the ledger model explicitly. The `AngeeResource` class could store a reference to the ledger model in its instance (`self.ledger_model = ...`), and the widgets could access it via `self.resource.ledger_model`. This would make the dependency explicit and remove the global state.

4.  
    - **Title**: Inconsistent ownership of "public ID" resolution.
    - **Dimension(s)**: Code decomposition, DRY, Naming conventions
    - **Location**: `src/angee/base/mixins/models.py:151`
    - **Severity**: Medium
    - **Problem**: The concept of a `public_id` is implemented inconsistently. `AngeeModel` provides a `public_id` property that falls back to `pk`. `SqidMixin` overrides it. Consumers of this ID, like `crud._resolve_for_delete` and `subscriptions._public_id`, have to inspect the model for a `from_public_id` method or `public_id` property. This violates the "Find the owner" principle (`AGENTS.md`). The logic for resolving an object from its public ID is scattered.
    - **Recommendation**: Consolidate public ID logic onto the base model. `AngeeModel` should define a single, consistent `from_public_id` classmethod that can be overridden by subclasses like `SqidMixin`. Consumers should only call `AngeeModel.from_public_id(value)`, trusting polymorphism to handle the implementation, rather than performing their own checks.

5.  
    - **Title**: Manual de-duplication of contributed schema parts.
    - **Dimension(s)**: Code decomposition, DRY
    - **Location**: `src/angee/base/graphql/schema.py:91`
    - **Severity**: Low
    - **Problem**: The `collect_schema_parts` function uses a `_dedupe` helper on the collected GraphQL schema contributions. This suggests that the process of discovering parts from addons can yield duplicates. The presence of a cleanup function indicates that the root cause of the duplication has not been addressed. This is a form of defensive coding that hides an underlying issue in the collection logic.
    - **Recommendation**: Investigate why `addon.get_schema_parts()` could produce duplicate objects within or across addons. The collection logic in `BaseAddonConfig` should be the single source of truth and guarantee uniqueness, removing the need for a downstream de-duplication step.

### Patterns & inconsistencies
- **Fighting the Framework**: The most significant pattern is the tendency to fight against Django's native mechanisms. The string-based model generation (`compose/emission.py`), the manual reconstruction of `Meta` attributes, and the complex field collision detection logic are all symptoms of an architecture that is side-stepping Django's own class inheritance and metaclass systems rather than leveraging them. This adds immense complexity and brittleness.
- **Hidden State and Context**: The codebase repeatedly relies on implicit context. The `sys.argv` check in `apps.py` and the `_active_ledger_model` global in `resources/widgets.py` are two critical examples. This pattern makes the code harder to test, understand, and safely reuse in different contexts.
- **Good
Determinism**: On the positive side, there is a consistent and laudable effort to ensure deterministic builds. The sorting of addons, models, fields, and resource files, along with the removal of timestamps from migration files, shows a strong commitment to reproducible outputs.
- **Inconsistent Abstraction Boundaries**: The resource loading system is a powerful abstraction, but its deep hooks into `django-import-export` (custom widgets, instance loaders) create a tight coupling. The public ID concept is another area where the abstraction is leaky, forcing consumers to know about its different implementations.

### Top 5 recommendations
1.  Replace the `sys.argv` check for build detection with an explicit flag passed through the application.
2.  Refactor the model composition to use `type()` to dynamically create classes at build-time instead of generating `.py` files from strings.
3.  Eliminate the use of a global variable for the resource ledger by passing it explicitly through the `AngeeResource` instance.
4.  Consolidate the `public_id` and `from_public_id` logic into a single, polymorphic pattern on the `AngeeModel` base class.
5.  Defer any new features until the model composition engine is refactored to be more Django-native, as this is the largest source of architectural debt.
