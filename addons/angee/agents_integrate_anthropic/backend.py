"""Anthropic SDK implementation of the agents inference backend."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from typing import Any, ClassVar

from angee.agents.backends import InferenceBackend, InferenceModelSpec, InferenceRequest, InferenceResponse

DEFAULT_MODEL_LIMIT = 1000
DEFAULT_BROKER_NAME = "anthropic"
_OAUTH_CREDENTIAL_KIND = "oauth"
_RESERVED_MESSAGE_OPTIONS = frozenset(
    {
        "max_tokens",
        "messages",
        "model",
        "stream",
        "system",
        "temperature",
        "tools",
    }
)


class AnthropicInferenceBackend(InferenceBackend):
    """Inference backend backed by Anthropic's official Python SDK."""

    key = "anthropic"
    label = "Anthropic"
    icon = "anthropic"
    oauth_client = "anthropic-platform"
    defaults = {
        "vendor": "anthropic",
        "config": {
            "credential_env": "ANTHROPIC_API_KEY",
        },
    }

    client_class: ClassVar[Any | None] = None

    def list_models(self) -> Sequence[InferenceModelSpec]:
        """List Anthropic models and their broker-prefixed aliases."""

        specs: list[InferenceModelSpec] = []
        for model in _iter_page(self.client().models.list(limit=self._model_limit())):
            model_id = str(getattr(model, "id", "") or "").strip()
            if not model_id:
                continue
            display_name = str(getattr(model, "display_name", "") or model_id)
            context_window = int(getattr(model, "max_input_tokens", 0) or 0)
            max_tokens = int(getattr(model, "max_tokens", 0) or 0)
            config = {"provider_model": model_id, "source": "anthropic"}
            capabilities = _json_object(getattr(model, "capabilities", None))
            specs.append(
                InferenceModelSpec(
                    handle=model_id,
                    display_name=display_name,
                    context_window=context_window,
                    max_output_tokens=max_tokens,
                    capabilities=capabilities,
                    config=config,
                )
            )
            broker_name = self._broker_name()
            if broker_name:
                specs.append(
                    InferenceModelSpec(
                        handle=f"{broker_name}/{model_id}",
                        display_name=f"{display_name} ({broker_name})",
                        context_window=context_window,
                        max_output_tokens=max_tokens,
                        capabilities=capabilities,
                        config={**config, "broker_name": broker_name},
                    )
                )
        return specs

    def chat(self, request: InferenceRequest) -> InferenceResponse:
        """Send one non-streaming Messages API request through Anthropic."""

        system, messages = self._anthropic_messages(request)
        params: dict[str, Any] = {
            **self._message_options(request),
            "model": self._provider_model(request.model),
            "messages": messages,
            "max_tokens": request.max_tokens,
        }
        if system:
            params["system"] = system
        if request.temperature is not None:
            params["temperature"] = request.temperature
        if request.tools:
            params["tools"] = list(request.tools)
        message = self.client().messages.create(**params)
        return InferenceResponse(
            text=_content_text(getattr(message, "content", [])),
            content=_json_list(getattr(message, "content", [])),
            usage=_json_object(getattr(message, "usage", None)),
            raw=_json_object(message),
        )

    def client(self) -> Any:
        """Return an Anthropic SDK client bound to this provider's credential."""

        client_class = self.client_class or self._load_client_class()
        kwargs: dict[str, Any] = self._credential_auth()
        base_url = str(getattr(self.provider, "base_url", "") or "").strip()
        if base_url:
            kwargs["base_url"] = base_url.rstrip("/")
        timeout = self._config_int("timeout_seconds", default=0)
        if timeout:
            kwargs["timeout"] = timeout
        return client_class(**kwargs)

    def _credential_auth(self) -> dict[str, str]:
        """Return SDK auth kwargs for the attached credential kind."""

        credential = getattr(self.integration, "credential", None)
        if credential is None:
            raise ValueError("Anthropic inference requires an attached credential.")
        ensure_fresh = getattr(credential, "ensure_fresh", None)
        if callable(ensure_fresh):
            ensure_fresh()
        secret = str(credential.secret_value() or "")
        if not secret:
            raise ValueError("Anthropic inference credential has no secret.")
        key = "auth_token" if _credential_kind(credential) == _OAUTH_CREDENTIAL_KIND else "api_key"
        return {key: secret}

    def _message_options(self, request: InferenceRequest) -> dict[str, Any]:
        """Return allowed provider-specific Messages API kwargs."""

        options = dict(request.options)
        reserved = _RESERVED_MESSAGE_OPTIONS & options.keys()
        if reserved:
            names = ", ".join(sorted(reserved))
            raise ValueError(f"Anthropic request option(s) are owned by the provider: {names}.")
        return options

    def _model_limit(self) -> int:
        """Return the configured Anthropic model-list page size."""

        return self._config_int("model_limit", default=DEFAULT_MODEL_LIMIT)

    def _broker_name(self) -> str:
        """Return the broker prefix to materialize beside native model ids."""

        value = self._config_value("broker_name", default=DEFAULT_BROKER_NAME)
        return str(value or "").strip().strip("/")

    def _provider_model(self, model: str) -> str:
        """Strip this provider's broker prefix before calling Anthropic."""

        handle = model.strip()
        broker_name = self._broker_name()
        prefix = f"{broker_name}/" if broker_name else ""
        return handle.removeprefix(prefix) if prefix else handle

    def _anthropic_messages(self, request: InferenceRequest) -> tuple[str, list[dict[str, Any]]]:
        """Return Anthropic Messages API ``system`` and ``messages`` arguments."""

        system_parts = [request.system.strip()] if request.system.strip() else []
        messages: list[dict[str, Any]] = []
        for item in request.messages:
            role = str(item.get("role") or "").strip()
            content = item.get("content", "")
            if role == "system":
                text = _string_content(content)
                if text:
                    system_parts.append(text)
                continue
            if role not in {"user", "assistant"}:
                raise ValueError(f"Anthropic messages only support user/assistant roles, got {role!r}.")
            messages.append({"role": role, "content": content})
        return "\n\n".join(part for part in system_parts if part), messages

    def _config_value(self, key: str, *, default: Any = None) -> Any:
        """Return one provider config value, falling back to integration config."""

        for owner in (getattr(self.provider, "config", None), getattr(self.integration, "config", None)):
            if isinstance(owner, Mapping) and key in owner:
                return owner[key]
        return default

    def _config_int(self, key: str, *, default: int) -> int:
        """Return one integer config value with a defensive fallback."""

        try:
            return int(self._config_value(key, default=default))
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _load_client_class() -> Any:
        """Import Anthropic lazily so tests can monkeypatch without the package."""

        try:
            from anthropic import Anthropic
        except ImportError as error:  # pragma: no cover - exercised only when dependency is missing at runtime.
            raise RuntimeError("Install the `anthropic` package to use the Anthropic inference backend.") from error
        return Anthropic


def _iter_page(page: Iterable[Any] | Any) -> list[Any]:
    """Return SDK page items from either an iterable page or a test double."""

    data = getattr(page, "data", None)
    if data is not None:
        return list(data)
    return list(page)


def _credential_kind(credential: Any) -> str:
    """Return a credential kind value without importing the integrate model."""

    kind = getattr(credential, "kind", "")
    return str(getattr(kind, "value", kind))


def _string_content(content: Any) -> str:
    """Return textual content from a string or Anthropic content-block list."""

    if isinstance(content, str):
        return content.strip()
    if isinstance(content, Sequence) and not isinstance(content, str | bytes):
        parts: list[str] = []
        for block in content:
            if isinstance(block, Mapping):
                text = block.get("text") if block.get("type") == "text" else ""
            else:
                text = getattr(block, "text", "") if getattr(block, "type", "") == "text" else ""
            if text:
                parts.append(str(text))
        return "\n".join(parts).strip()
    return str(content or "").strip()


def _content_text(content: Any) -> str:
    """Return the concatenated assistant text blocks from Anthropic content."""

    return _string_content(content)


def _json_list(value: Any) -> list[dict[str, Any]]:
    """Return a JSON-safe list of mapping objects."""

    dumped = _json_value(value)
    if isinstance(dumped, list):
        return [item if isinstance(item, dict) else {"value": item} for item in dumped]
    return []


def _json_object(value: Any) -> dict[str, Any]:
    """Return a JSON-safe object from SDK models, mappings, or plain objects."""

    dumped = _json_value(value)
    return dumped if isinstance(dumped, dict) else {}


def _json_value(value: Any) -> Any:
    """Return a value safe to store in JSONField/GraphQL JSON."""

    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, Mapping):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, str | bytes):
        return [_json_value(item) for item in value]
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            return model_dump(mode="json")
        except TypeError:
            return model_dump()
    attrs = {
        key: item
        for key, item in getattr(value, "__dict__", {}).items()
        if not key.startswith("_")
    }
    return {key: _json_value(item) for key, item in attrs.items()}
