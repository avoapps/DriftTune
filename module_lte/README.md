# Module LTE — Transport Layer

Optimized binary transport between RPi (car) and BoxLab (pit box).

## Architecture

```
RPi Core (ws://localhost:8765)
        │
   DeltaEncoder          ← sends only changed fields
        │
   msgpack.packb()       ← binary compression (~80% smaller than JSON)
        │
   LTE / WiFi / 4G
        │
   LTEReceiver (port 9000)
        │
   msgpack.unpackb()
        │
   CarState (full state reconstructed)
        │
   BoxLab UI (ws://localhost:9000/ws/telemetry/CAR_01)
```

## Running

### On RPi (one process per car):

```bash
pip install -r requirements.txt

# Connect to BoxLab at 192.168.1.100
python lte_sender.py --car CAR_01 --host 192.168.1.100 --port 9000

# Second car
python lte_sender.py --car CAR_02 --host 192.168.1.100 --port 9000
```

### On BoxLab machine:

```bash
pip install -r requirements.txt
python lte_receiver.py
```

BoxLab UI connects to: `ws://localhost:9000/ws/telemetry/CAR_01`

## Delta encoding

Only sends fields that change beyond a threshold:
- `rpm` → only if change > 10 rpm
- `gx` → only if change > 0.01 G
- `h2o` → only if change > 0.5°C

First frame after connect always sends full state.
Buffer stores up to 500 frames on signal loss — flushed on reconnect.

## Bandwidth estimate

| Mode       | Raw JSON | After delta + msgpack |
|------------|----------|-----------------------|
| Full frame | ~2.5 KB  | ~2.5 KB               |
| Typical    | ~2.5 KB  | ~200–400 B            |
| Saving     | —        | ~85%                  |

At 50 Hz: ~100–200 KB/s vs ~125 KB/s raw JSON.
