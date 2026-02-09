"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import NotificationOnboardingModal from "@/components/NotificationOnboardingModal";
import type { NotificationModalContextType } from "@/components/NotificationOnboardingModal";
import type { User } from "@supabase/supabase-js";

interface NotificationModalOptions {
  contextType: NotificationModalContextType;
  onSuccess?: (user: User) => void;
}

interface NotificationModalContextValue {
  openNotificationModal: (options: NotificationModalOptions) => void;
  closeNotificationModal: () => void;
}

const NotificationModalContext = createContext<NotificationModalContextValue>({
  openNotificationModal: () => {},
  closeNotificationModal: () => {},
});

export function useNotificationModal() {
  return useContext(NotificationModalContext);
}

export function NotificationModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<NotificationModalOptions>({
    contextType: "vessel",
  });

  const openNotificationModal = useCallback(
    (opts: NotificationModalOptions) => {
      setOptions(opts);
      setIsOpen(true);
    },
    []
  );

  const closeNotificationModal = useCallback(() => {
    setIsOpen(false);
    setOptions({ contextType: "vessel" });
  }, []);

  const handleSuccess = useCallback((user: User) => {
    options.onSuccess?.(user);
    closeNotificationModal();
  }, [options, closeNotificationModal]);

  return (
    <NotificationModalContext.Provider
      value={{ openNotificationModal, closeNotificationModal }}
    >
      {children}
      {isOpen && (
        <NotificationOnboardingModal
          contextType={options.contextType}
          onSuccess={handleSuccess}
          onClose={closeNotificationModal}
        />
      )}
    </NotificationModalContext.Provider>
  );
}
