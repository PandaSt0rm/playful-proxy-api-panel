# SDK Watcher Integration

1. Instantiate the SDK service.
2. Allocate the auth update queue before the watcher starts.
3. Wire `SetAuthUpdateQueue` on the `WatcherWrapper`.
4. Start the watcher.
5. Provide a config reload callback.

The SDK service exposes a watcher integration that surfaces granular auth updates without a full reload.

## Update Queue Contract

- `watcher.AuthUpdate` represents a single credential change. `Action` can be `add`, `modify`, or `delete`. `ID` carries the credential identifier.
- For `add`/`modify` the `Auth` payload contains a full clone of the credential. `delete` can omit `Auth`.
- `WatcherWrapper.SetAuthUpdateQueue(chan<- watcher.AuthUpdate)` wires the queue from the SDK service into the watcher. Create the queue before the watcher starts.
- The service builds the queue via `ensureAuthUpdateQueue`. It uses a buffered channel (`capacity=256`) and a dedicated consumer goroutine (`consumeAuthUpdates`).
- The consumer drains bursts. It loops through the backlog before it reacquires the select loop.

## Watcher Behaviour

- `internal/watcher/watcher.go` keeps a shadow snapshot of auth state (`currentAuths`).
- Each filesystem or configuration event triggers a recomputation and a diff against the previous snapshot.
- The diff produces minimal `AuthUpdate` entries for adds, edits, and removals.
- Updates are coalesced per credential identifier.
- If multiple changes occur before dispatch (for example a write, then a delete), only the final action is sent downstream.
- The watcher runs an internal dispatch loop. It buffers updates that wait in memory.
- It forwards them to the queue without a block on the producer. Producers enqueue into the in-memory buffer and signal the dispatcher.
- Dispatch stops when the watcher stops, so goroutines exit cleanly.

## Handle high-frequency changes

- The dispatch loop and the service consumer run independently. Filesystem watchers do not block when many updates arrive at once.
- Back-pressure is absorbed in two places:
  - The dispatch buffer (map + order slice) coalesces repeated updates for the same credential until the consumer catches up.
  - The service channel capacity (256) plus the consumer drain loop lets several bursts process without oscillation.
- If the queue is saturated for a long period, updates continue to merge. The latest state is applied. Redundant intermediate states are not replayed.

## Usage Checklist

1. Instantiate the SDK service (builder or manual construction).
2. Call `ensureAuthUpdateQueue` before you start the watcher to allocate the shared channel.
3. When the `WatcherWrapper` is created, call `SetAuthUpdateQueue` with the service queue.
4. Start the watcher.
5. Provide a reload callback for configuration updates.
6. Auth deltas arrive via the queue. The service applies them through `handleAuthUpdate`.

Check: an auth file add or edit produces an `AuthUpdate` without a full service reload.
