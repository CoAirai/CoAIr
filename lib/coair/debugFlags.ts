/** Client-side gate for MFA / invite debug codes. Off unless explicitly enabled. */
export function showAuthDebugCodes(): boolean {
    return process.env.NEXT_PUBLIC_COAIR_SHOW_DEBUG_CODES === "1";
}
