// Shared coordinator singleton — ensures SSE and API share one instance
// Both the SSE stream and the investigate API route use this
// so events flow through a single coordinator to all connected clients

import { Coordinator, type InvestigationUpdate } from './coordinator';

type Listener = (update: InvestigationUpdate) => void;

const _g = globalThis as unknown as {
  __prowl_coordinator?: Coordinator;
  __prowl_listeners?: Set<Listener>;
};

function getListeners(): Set<Listener> {
  if (!_g.__prowl_listeners) _g.__prowl_listeners = new Set();
  return _g.__prowl_listeners;
}

export function getSharedCoordinator(): Coordinator {
  if (!_g.__prowl_coordinator) {
    const coordinator = new Coordinator();
    coordinator.setUpdateCallback((update) => {
      for (const listener of getListeners()) {
        try { listener(update); } catch { /* listener errored */ }
      }
    });
    _g.__prowl_coordinator = coordinator;
  }
  return _g.__prowl_coordinator;
}

export function addStreamListener(listener: Listener): () => void {
  const listeners = getListeners();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
