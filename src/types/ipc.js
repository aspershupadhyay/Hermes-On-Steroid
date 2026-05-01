"use strict";
/**
 * IPC channel contracts — single source of truth imported by main.ts,
 * preload.ts, and any renderer code that calls window.api.
 *
 * Rule: every channel name, request payload, and response payload is
 * defined here.  Nothing is typed inline at the call site.
 */
Object.defineProperty(exports, "__esModule", { value: true });
