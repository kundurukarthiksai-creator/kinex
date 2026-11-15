# Kinex model library

## blendnet.jsonl

10,065 example models converted from **BlendNet** (FreedomIntelligence), the text-to-Blender
dataset behind BlenderLLM: https://huggingface.co/datasets/FreedomIntelligence/BlendNet
License: Apache License 2.0.

Changes: each Blender script was evaluated by a sandboxed interpreter
(`scripts/blendnet/convert.py`, the scripts are never executed) and the primitives it places
were re-expressed as Kinex one-line parts (Y-up, Kinex shapes and materials). Rows that use
modifiers, booleans, text or mesh editing were skipped.

## user.jsonl, votes.json

Models people liked in Kinex, and votes on library models. The builder ranks references by
similarity and votes, so this is how Kinex learns from use.

## vectors.bin

Embeddings of the library (local `embeddinggemma` via Ollama). Not committed; the dev server
rebuilds it on first start.
