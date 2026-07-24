import type { StructuredError } from "@/lib/errors"
import { parseError } from "@/lib/errors"
import { captureException } from "@/lib/sentry"

// The goal of this module is to ensure raw RPC/JSON-RPC/Soroban details never
// reach user-facing UI.

const GENERIC_ERROR: Omit<StructuredError, "code"> = {
    i18nKey: "errors.unknown",
    title: "errors.unknown.title",
    message: "errors.unknown.message",
    recovery: "errors.unknown.recovery",
    link: null,
}

export function sanitizeError(error: unknown): StructuredError {
    // Preserve full details for debugging.
    try {
        // Intentionally only log in production-like builds.
        // Vitest/stderr is noisy otherwise.
        if (!import.meta.env.DEV) {
            if (error instanceof Error) {
                captureException(error, { source: "error-sanitizer" })
            } else {
                captureException(new Error(String(error)), { source: "error-sanitizer" })
            }
        }
    } catch {
        // ignore logging failures
    }

    // `parseError` returns i18nKey + predefined strings (after the fallback fix).
    // We still enforce the contract that we never expose raw RPC strings.
    const parsed = parseError(error)

    // Hard guarantee: if parseError ever returns a message that doesn't look like
    // an i18n key, replace it.
    const safeMessage = typeof parsed.message === "string" && parsed.message.startsWith("errors.")
        ? parsed.message
        : GENERIC_ERROR.message

    return {
        ...parsed,
        message: safeMessage,
        title: parsed.title.startsWith("errors.") ? parsed.title : GENERIC_ERROR.title,
        recovery: parsed.recovery && parsed.recovery.startsWith("errors.") ? parsed.recovery : GENERIC_ERROR.recovery,
        // Never expose endpoint URLs in links/title/message.
        link: parsed.link && parsed.link.url ? parsed.link : null,
    }
}


