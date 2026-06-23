# Architecture

Multipass is organized around five layers.

## 1. Product surface

The web app is the human-facing control surface for profiles, ownership, permissions, custody state, linked fragments, work history, and trust context.

## 2. API boundary

The API exposes agent-readable profiles, identity graph data, standards references, endpoint metadata, and trust context.

## 3. Onchain modules

Contracts anchor ownership, control, binding references, registry state, and upgradeable modules where onchain guarantees are required.

## 4. SDK and schemas

Shared types and SDKs make Multipass data easy for agents, apps, indexers, and partner systems to consume.

## 5. Adapters

Adapters connect Multipass to external identity, tool, payment, communication, verification, and work-history systems without making any single external rail the whole product.
