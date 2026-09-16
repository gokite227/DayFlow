import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { openSystemSettings, readPermission, requestPermission } from "./notification-adapter";
import type { PermissionSnapshot } from "./permission-state";
import { reconcileEventReminders } from "./reconcile-service";

export const NOTIFICATION_PERMISSION_KEY = ["device", "notification-permission"] as const;

/**
 * Permission state for the reminder UI. It is a device query refetched whenever the app regains focus,
 * because the user may have changed it in the OS settings. Asking is always an explicit user action.
 */
export function useNotificationPermission() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: NOTIFICATION_PERMISSION_KEY, queryFn: readPermission, staleTime: 0, retry: false });

  const request = useCallback(async (): Promise<PermissionSnapshot> => {
    const next = await requestPermission();
    queryClient.setQueryData(NOTIFICATION_PERMISSION_KEY, next);
    void reconcileEventReminders("permission-changed");
    return next;
  }, [queryClient]);

  return { snapshot: query.data ?? null, request, openSettings: openSystemSettings };
}