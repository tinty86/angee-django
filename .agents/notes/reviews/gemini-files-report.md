### Summary

The package's file layout is largely idiomatic Django, but several significant deviations exist. Code is generally well-placed within role-named modules (`apps.py`, `managers.py`, etc.), and naming conventions for classes and functions are mostly followed. The single biggest problem is the misplacement and incorrect naming of model mixins within a `mixins/models.py` file, which directly contradicts the documented convention of using a single `mixins.py` file.

### Findings

1.  **Title**: Model mixins are in `mixins/models.py` instead of `mixins.py`.
    *   **Type**: `module-name`
    *   **Location**: `src/angee/base/mixins/models.py`
    *   **Severity**: High
    *   **Why it isn't Django**: The `docs/backend/guidelines.md` specifies that modules should be role-named, such as `mixins.py`. Placing model mixins in a `models.py` file under a `mixins/` directory is an incorrect composition of two role names.
    *   **Move/Rename to**: All content from `src/angee/base/mixins/models.py` should be moved to `src/angee/base/mixins.py`, and the `mixins/` directory should be removed or flattened.

2.  **Title**: The `register_revision_models` function is located with model mixins instead of with app loading logic.
    *   **Type**: `wrong-file`
    *   **Location**: `src/angee/base/mixins/models.py:175`
    *   **Severity**: Medium
    *   **Why it isn't Django**: This function is a one-off helper called only from `angee.base.apps.BaseConfig.ready()`. Helper functions should live with the code that uses them. In this case, it's part of the app's setup routine and has no direct relationship with the model mixins other than operating on models that might use them. It doesn't belong in a module dedicated to mixins.
    *   **Move/Rename to**: Move the function `register_revision_models` into `src/angee/base/apps.py`, defined before `BaseConfig` which is its only caller.

3.  **Title**: The base model `AngeeModel` does not have a `Mixin` suffix.
    *   **Type**: `class-name`
    *   **Location**: `src/angee/base/mixins/models.py:20`
    *   **Severity**: Medium
    *   **Why it isn't Django**: `docs/backend/guidelines.md` states classes should have a role suffix. `AngeeModel` serves as a base class providing mixin-like functionality for all other models, and it's defined in the mixins module. It should be named `AngeeModelMixin` to clearly indicate its role as a mixin, even if it's a base class.
    *   **Move/Rename to**: Rename `AngeeModel` to `AngeeModelMixin`.

4.  **Title**: The `base` addon's `models.py` re-exports a model from another app.
    *   **Type**: `wrong-file`
    *   **Location**: `src/angee/base/models.py`
    *   **Severity**: Low
    *   **Why it isn't Django**: A `models.py` file should define the models for its app. This file only contains `from angee.base.resources.models import Resource`. This suggests `Resource` is a `base` model, but it's defined in `angee.base.resources.models.py`. This creates confusion about which addon owns the `Resource` model. If `Resource` belongs to `base`, its definition should be in `angee/base/models.py`. If it belongs to `resources`, then `angee/base/models.py` is misleading and should likely be removed.
    *   **Move/Rename to**: Move the `Resource` model definition from `src/angee/base/resources/models.py` to `src/angee/base/models.py`. The `resources` sub-package can still contain managers, loaders, etc., for that model.

5.  **Title**: A settings helper module is named `settings.py`.
    *   **Type**: `module-name`
    *   **Location**: `src/angee/base/settings.py`
    *   **Severity**: Low
    *   **Why it isn't Django**: In Django, `settings.py` typically contains the full project settings. This file exports a `compose_defaults` function that *generates* a dictionary of settings. This is a library providing a helper, not a settings file itself. The name is ambiguous and could be confused with actual project settings.
    *   **Move/Rename to**: Rename `src/angee/base/settings.py` to `src/angee/base/settings_helpers.py` or a similar name to clarify its role as a helper module.

### Naming/placement patterns

- **Mixin Placement**: There's a clear misunderstanding of how to name and place mixin modules, as seen with `mixins/models.py`. The convention of a single, role-named file (`mixins.py`) was not followed.
- **Ownership Ambiguity**: There is some ambiguity in model ownership between the `base` addon and its sub-packages (like `resources`). A model's definition should be in the `models.py` of the addon that conceptually owns it.
- **Helper Function Placement**: Utility functions tend to be placed with related classes, but sometimes without considering the "caller's ownership" principle, as seen with `register_revision_models`.
