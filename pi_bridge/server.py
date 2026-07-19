from __future__ import annotations

import argparse
import asyncio
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import mido
from websockets.asyncio.server import ServerConnection, serve

MIDI_MIN = 21
MIDI_MAX = 108
OUTPUT_COUNT = 100
TICK_SECONDS = 0.01


@dataclass(frozen=True)
class LedEvent:
    time: float
    index: int
    on: bool
    velocity: int


def decode_midi(path: Path) -> tuple[list[LedEvent], float]:
    midi = mido.MidiFile(path)
    tempo = 500_000
    elapsed = 0.0
    events: list[LedEvent] = []
    for message in mido.merge_tracks(midi.tracks):
        elapsed += mido.tick2second(message.time, midi.ticks_per_beat, tempo)
        if message.type == "set_tempo":
            tempo = message.tempo
            continue
        if message.type not in {"note_on", "note_off"}:
            continue
        if not MIDI_MIN <= message.note <= MIDI_MAX:
            continue
        on = message.type == "note_on" and message.velocity > 0
        events.append(
            LedEvent(
                time=elapsed,
                index=message.note - MIDI_MIN,
                on=on,
                velocity=message.velocity,
            )
        )
    events.sort(key=lambda event: event.time)
    return events, max(elapsed, events[-1].time if events else 0.0)


class SimulatedLedSink:
    def __init__(self) -> None:
        self.outputs = [False] * OUTPUT_COUNT

    def set(self, index: int, on: bool) -> bool:
        changed = self.outputs[index] != on
        self.outputs[index] = on
        return changed

    def clear(self) -> None:
        self.outputs = [False] * OUTPUT_COUNT


class MidiLedBridge:
    def __init__(self, midi_path: Path) -> None:
        self.midi_path = midi_path
        self.events, self.duration = decode_midi(midi_path)
        self.sink = SimulatedLedSink()
        self.clients: set[ServerConnection] = set()
        self.state = "idle"
        self.position = 0.0
        self.cursor = 0
        self.active_counts = [0] * OUTPUT_COUNT
        self._last_tick = time.monotonic()
        self._last_status_second = -1

    def status_message(self) -> dict[str, Any]:
        return {
            "type": "status",
            "state": self.state,
            "song": self.midi_path.name,
            "position": self.position,
            "duration": self.duration,
            "eventCount": len(self.events),
        }

    async def broadcast(self, message: dict[str, Any]) -> None:
        if not self.clients:
            return
        payload = json.dumps(message, separators=(",", ":"))
        await asyncio.gather(
            *(client.send(payload) for client in tuple(self.clients)),
            return_exceptions=True,
        )

    async def send_snapshot(self, client: ServerConnection) -> None:
        await client.send(json.dumps({"type": "snapshot", "outputs": self.sink.outputs}))
        await client.send(json.dumps(self.status_message()))

    async def clear_outputs(self) -> None:
        self.sink.clear()
        self.active_counts = [0] * OUTPUT_COUNT
        await self.broadcast({"type": "clear_all"})

    async def start(self) -> None:
        self.position = 0.0
        self.cursor = 0
        await self.clear_outputs()
        self.state = "playing"
        self._last_tick = time.monotonic()
        await self.broadcast(self.status_message())

    async def pause(self) -> None:
        if self.state != "playing":
            return
        self.state = "paused"
        await self.broadcast(self.status_message())

    async def resume(self) -> None:
        if self.state != "paused":
            return
        self.state = "playing"
        self._last_tick = time.monotonic()
        await self.broadcast(self.status_message())

    async def stop(self) -> None:
        self.state = "stopped"
        self.position = 0.0
        self.cursor = 0
        await self.clear_outputs()
        await self.broadcast(self.status_message())

    async def command(self, command: str) -> None:
        if command == "start":
            await self.start()
        elif command == "pause":
            await self.pause()
        elif command == "resume":
            await self.resume()
        elif command == "stop":
            await self.stop()
        else:
            await self.broadcast({"type": "error", "message": f"Unknown command: {command}"})

    async def apply_event(self, event: LedEvent) -> None:
        if event.on:
            self.active_counts[event.index] += 1
        else:
            self.active_counts[event.index] = max(0, self.active_counts[event.index] - 1)
        on = self.active_counts[event.index] > 0
        if not self.sink.set(event.index, on):
            return
        await self.broadcast(
            {
                "type": "set",
                "index": event.index,
                "on": on,
                "velocity": event.velocity,
            }
        )

    async def playback_loop(self) -> None:
        while True:
            now = time.monotonic()
            if self.state == "playing":
                self.position += now - self._last_tick
                while self.cursor < len(self.events) and self.events[self.cursor].time <= self.position:
                    await self.apply_event(self.events[self.cursor])
                    self.cursor += 1
                second = int(self.position)
                if second != self._last_status_second:
                    self._last_status_second = second
                    await self.broadcast(self.status_message())
                if self.cursor >= len(self.events) and self.position >= self.duration:
                    self.state = "finished"
                    await self.clear_outputs()
                    await self.broadcast(self.status_message())
            self._last_tick = now
            await asyncio.sleep(TICK_SECONDS)

    async def handler(self, client: ServerConnection) -> None:
        self.clients.add(client)
        print(f"client connected: {client.remote_address}", flush=True)
        try:
            await self.send_snapshot(client)
            async for raw in client:
                try:
                    message = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    continue
                if message.get("type") == "command" and isinstance(message.get("command"), str):
                    await self.command(message["command"])
        finally:
            self.clients.discard(client)
            print(f"client disconnected: {client.remote_address}", flush=True)


async def run(args: argparse.Namespace) -> None:
    bridge = MidiLedBridge(args.midi)
    print(
        f"decoded {len(bridge.events)} LED events from {args.midi.name}; "
        f"duration={bridge.duration:.2f}s",
        flush=True,
    )
    playback = asyncio.create_task(bridge.playback_loop())
    try:
        async with serve(bridge.handler, args.host, args.port):
            print(f"listening on ws://{args.host}:{args.port}/leds", flush=True)
            await asyncio.Future()
    finally:
        playback.cancel()
        await asyncio.gather(playback, return_exceptions=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="MIDI-to-LED WebSocket verification bridge")
    parser.add_argument("--midi", type=Path, required=True)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if not args.midi.is_file():
        parser.error(f"MIDI file not found: {args.midi}")
    return args


if __name__ == "__main__":
    asyncio.run(run(parse_args()))
