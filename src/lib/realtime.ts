import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export type ChannelStatus = 'subscribed' | 'error' | 'closed';

/**
 * Starts listening to one realtime topic and returns a function that stops. Screens treat every
 * event as "reload your snapshot" and every (re)subscription as "reload, you may have missed events".
 */
export type Subscribe = (handlers: { onEvent: () => void; onStatus: (status: ChannelStatus) => void }) => () => void;

export function broadcastSubscriber(client: SupabaseClient, topic: string, isPrivate: boolean): Subscribe {
  return ({ onEvent, onStatus }) => {
    let stopped = false;
    let channel: RealtimeChannel | null = null;
    // Deferred, so React StrictMode's mount → unmount → mount never creates a channel it abandons.
    void (async () => {
      if (isPrivate) {
        try {
          await client.realtime.setAuth(); // private channels need the signed-in user's token
        } catch {
          // The join below then fails and reports CHANNEL_ERROR, which the screen shows.
        }
      }
      await Promise.resolve();
      if (stopped) return;
      channel = client
        .channel(topic, { config: { private: isPrivate } })
        .on('broadcast', { event: '*' }, () => {
          if (!stopped) onEvent();
        })
        .subscribe((status) => {
          if (stopped) return;
          if (status === 'SUBSCRIBED') onStatus('subscribed');
          else if (status === 'CLOSED') onStatus('closed');
          else onStatus('error');
        });
    })();
    return () => {
      stopped = true;
      if (channel) void client.removeChannel(channel);
    };
  };
}
