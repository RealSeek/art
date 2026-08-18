# Xinyue Controlled ComfyUI Gateway

This optional gateway exposes only administrator-mounted ComfyUI workflows through the Xinyue Local Worker protocol. Users cannot submit workflow JSON, node IDs or arbitrary parameters.

Each `/workflows/*.json` file must contain:

```json
{
  "id": "product-v1",
  "name": "商品视觉工作流",
  "workflow": { "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "" } } },
  "bindings": {
    "prompt": { "node": "6", "field": "text" },
    "negativePrompt": { "node": "7", "field": "text" },
    "width": { "node": "5", "field": "width" },
    "height": { "node": "5", "field": "height" },
    "seed": { "node": "3", "field": "seed" },
    "image": { "node": "10", "field": "image" }
  },
  "outputNodes": ["9"],
  "limits": { "minDimension": 256, "maxDimension": 2048 }
}
```

The example above documents the manifest shape only; it is not a complete workflow. Export an API-format workflow from the operator's ComfyUI instance, review every node and model, then mount it read-only. Changing workflow files requires a gateway restart.
