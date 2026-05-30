### Summary
The package is only partly idiomatic Django: `apps.py`, `urls.py`, `settings.py`, and `management/commands/` mostly read as expected. The biggest placement problem is that base-addon model and mixin code is routed through nested feature packages (`resources/models.py`, `mixins/models.py`) instead of the Django-owned app modules `models.py`, `managers.py`, and `mixins.py`.

### Findings

1. **Base source model lives in a nested resource package**
- **Type**: `wrong-file`
- **Location**: `src/angee/base/resources/models.py:12` (`Resource`; should be in `src/angee/base/models.py`, not re-exported from `src/angee/base/models.py:3`)
- **Severity**: High
- **Why it isn't Django**: `docs/backend/guidelines.md` says source models live in conventional `models.py`, and the Naming section says modules are role-named by Django convention. `AGENTS.md` treats naming as a structural contract.
- **Move/Rename to**: Move `Resource` and `Resource.Tier` into `src/angee/base/models.py`; delete the façade import/re-export.

2. **Model mixins are hidden behind `mixins/models.py`**
- **Type**: `wrong-file`
- **Location**: `src/angee/base/mixins/models.py:13` (`TimestampMixin`; model mixins should be in `src/angee/base/mixins.py`)
- **Severity**: High
- **Why it isn't Django**: the Naming section names `mixins.py` as the Django role module and requires `*Mixin` classes to mirror that role. A nested `mixins/models.py` invents a second role boundary.
- **Move/Rename to**: Move `TimestampMixin`, `SqidMixin`, `HistoryMixin`, and `RevisionMixin` to `src/angee/base/mixins.py`.

3. **The abstract base model is filed as a mixin**
- **Type**: `wrong-file`
- **Location**: `src/angee/base/mixins/models.py:25` (`AngeeModel`; should be an app model/base model in `src/angee/base/models.py`)
- **Severity**: High
- **Why it isn't Django**: `AngeeModel` is not named or shaped as a `*Mixin`; it is the abstract model base used by source models. `docs/backend/guidelines.md` says model behavior lives on models and source models live in `models.py`.
- **Move/Rename to**: Move `AngeeModel` to `src/angee/base/models.py`; leave only true `*Mixin` classes in `mixins.py`.

4. **Resource QuerySet/Manager are nested under a feature package**
- **Type**: `wrong-file`
- **Location**: `src/angee/base/resources/managers.py:30` (`ResourceQuerySet`) and `src/angee/base/resources/managers.py:249` (`ResourceManager`; should be app-level `managers.py`)
- **Severity**: Medium
- **Why it isn't Django**: the Naming section names `managers.py` as the role module, and the Django-Native Rule says row-set behavior lives on managers and querysets. A Django developer would look beside `models.py`, not under `resources/`.
- **Move/Rename to**: Move `ResourceQuerySet` and `ResourceManager` to `src/angee/base/managers.py`.

5. **Public GraphQL helper names are nouns, not verb-first functions**
- **Type**: `method-name`
- **Location**: `src/angee/base/graphql/crud.py:42` (`crud`) and `src/angee/base/graphql/subscriptions.py:45` (`changes`)
- **Severity**: Medium
- **Why it isn't Django**: the Naming section requires methods/functions to be snake_case and verb-first from a stable vocabulary. These are public addon APIs that create Strawberry surfaces, but their names are nouns.
- **Move/Rename to**: Rename `crud` to `create_crud_mutation` and `changes` to `create_changes_subscription`.

6. **Resource conversion/accessor methods use noun/adjective names**
- **Type**: `method-name`
- **Location**: `src/angee/base/resources/entries.py:143` (`inferred_model_label`), `src/angee/base/resources/entries.py:364` (`dataset`), `src/angee/base/resources/loader.py:249` (`resource_for`)
- **Severity**: Low
- **Why it isn't Django**: the Naming section says accessors use `get_*`, conversions use `as_*` / `to_*` / `from_*`, and creation helpers use `create_*`. These public names describe values rather than actions.
- **Move/Rename to**: `get_inferred_model_label`, `to_dataset` or `as_dataset`, and `create_resource_for`.

### Naming/placement patterns
The app-level Django roles are strongest where the package follows Django exactly: `apps.py`, `urls.py`, `settings.py`, and `management/commands/` are easy to locate. The recurring issue is feature-package nesting around Django roles: `resources/models.py`, `resources/managers.py`, and `mixins/models.py` make the base addon feel like several mini-apps inside one app instead of one Django app with conventional role modules. Public builder/accessor APIs also drift from the verb-first Naming vocabulary in the GraphQL and resources helpers.
