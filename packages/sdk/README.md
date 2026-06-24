# @helixa/multipass-sdk

Small validation and loading helpers for Multipass schema contracts.

The SDK consumes the schema registry from `@helixa/multipass-types` and exposes helpers for the six public document shapes:

- Multipass profiles
- Identity fragments
- Agent cards
- Standards profiles
- x402 manifests
- Receipt fragments

This package intentionally starts small. It validates local objects, parses JSON strings, and loads JSON files without hiding schema errors.
