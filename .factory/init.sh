#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Install dependencies (idempotent)
if [ ! -d "node_modules" ]; then
  bun install
fi
