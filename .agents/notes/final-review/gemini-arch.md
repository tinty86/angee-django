### Summary

The Angee framework core is generally well-structured and adheres to its own architectural principles, particularly the "Find the Owner" and "Django-Native" rules. The separation between the `base` runtime, `resources` data-loading subsystem, and `compose` build-time engine is clear and respected. However, two areas exhibit significant complexity that violates the project's own "avoid red flags" guideline: the resource loading subsystem is overly complex, and the core model composition logic relies on brittle string formatting to generate code. These areas are liabilities that will make maintenance and extension difficult. While the framework is functional, addressing this complexity should be the highest priority.

### Findings

1.  
    - **Title**: Model composition uses brittle string formatting to generate code
    - **Lens(es)**: Readability & docstrings, Decomposition
    - **Location**: `src/angee/compose/runtime.py:228`
    - **Severity**: High
    - **Problem**: The `AngeeRuntime._models_source` method constructs Python source code for concrete models by concatenating strings. This approach is difficult to read, hard to maintain, and prone to syntax errors that won't be caught until the generated code is inspected or executed. It violates the "Avoid Red Flags" principle, specifically "The code is bigger instead of smarter." (`docs/guidelines.md`).
    - **Recommendation**: Refactor this method to use a dedicated code generation tool or an Abstract Syntax Tree (AST) library. Using a template engine like Jinja2 or programmatically building and then unparsing an AST would make the code generation more robust, readable, and maintainable.

2.  
    - **Title**: Resource loading logic is overly complex
    - **Lens(es)**: Decomposition, Readability & docstrings
    - **Location**: `src/angee/resources/loader.py:65`
    - **Severity**: Medium
    - **Problem**: The `AngeeResource.import_row` method is long and contains deeply nested logic for handling several distinct concerns: checking the resource ledger, handling frozen tiers, adopting existing instances, and skipping unchanged rows. This concentration of logic in one method makes it difficult to understand and modify, violating the "Spaghetti code" red flag (`docs/guidelines.md`).
    - **Recommendation**: Decompose `import_row` into smaller, single-purpose helper methods. For example, create separate methods for ledger checking (`_check_ledger_for_skip`), instance adoption (`_try_adopt_instance`), and determining the import action. This would improve clarity and align better with the "Put Behavior on the Owning Object" principle.

3.  
    - **Title**: Unsafe serialization to JSON can lead to data corruption or non-deterministic behavior
    - **Lens(es)**: DRY, Boundaries & layering
    - **Location**: `src/angee/base/signals.py:127`
    - **Severity**: Low
    - **Problem**: The `_json_safe` function in `angee.base.signals` (and a similar `_json_default` in `angee.resources.loader.py:236`) uses a catch-all `return str(value)` for any type it doesn't explicitly recognize. This is risky because the `str()` representation of many objects is not valid JSON, not deserializable, or not deterministic (e.g., for objects showing a memory address). This could lead to corrupted change event payloads or incorrect content hashes for resource rows.
    - **Recommendation**: Make the serialization explicit. The function should raise a `TypeError` for unsupported types instead of falling back to `str()`. This ensures that only deliberately supported and serializable types are processed, making the system more robust and predictable.

4.  
    - **Title**: Inconsistent `AppConfig` implementation for composer
    - **Lens(es)**: Naming, Boundaries & layering
    - **Location**: `src/angee/compose/apps.py:6`
    - **Severity**: Low
    - **Problem**: `ComposeConfig` inherits directly from Django's `AppConfig`, while all other addons inherit from `BaseAddonConfig`. `docs/backend/guidelines.md` states: "A non-addon package that owns commands (the composer, the resource subsystem) provides a plain AppConfig and is installed". While this follows the rule, it creates an inconsistency. `angee.resources` also provides a command but uses a plain `AppConfig` (`ResourcesConfig`), which is consistent. The inconsistency is that product addons must use `BaseAddonConfig`, but internal framework components with commands do not, which might be confusing.
    - **Recommendation**: This appears to be a deliberate design choice to separate "addons" from "command hosts". The documentation should be clarified to explicitly state *why* `ComposeConfig` and `ResourcesConfig` are not `BaseAddonConfig` instances, linking it to the build-time vs. runtime separation to make the pattern clearer. No code change is needed if this is the intended design.

### Patterns & inconsistencies

- **Code Generation via String Formatting**: A critical anti-pattern is present in `angee.compose.runtime.py`, where Python code is generated using f-strings and concatenation. This is a recurring source of fragility in software and should be systemically replaced with more robust techniques like AST manipulation.
- **Over-reliance on `str()` for Serialization**: Two separate modules (`signals.py` and `loader.py`) use a broad `str()` cast as a fallback for JSON serialization. This indicates a missing shared, strict serialization utility, leading to duplicated and unsafe code.
- **Complex, Monolithic Methods**: The `AngeeResource` class in the resource loader contains methods that are too large and handle too many responsibilities, a pattern that goes against the project's stated goal of avoiding "Spaghetti code."

### Top recommendations

1.  Replace the string-based code generation in `AngeeRuntime._models_source` with an AST-based approach to improve robustness and maintainability.
2.  Refactor the `AngeeResource.import_row` method by breaking its logic into smaller, clearly-named helper methods to improve readability.
3.  Create a single, strict JSON serialization utility that raises errors on unsupported types and use it in both `angee.base.signals` and `angee.resources.loader` to eliminate the unsafe `str()` fallback.
