"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import NotificationOnboardingModal from "@/components/NotificationOnboardingModal";

interface NotificationModalOptions {
  vesselId: string;
  onSuccess?: () => void;
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
    vesselId: "",
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
    setOptions({ vesselId: "" });
  }, []);

  const handleSuccess = useCallback(() => {
    options.onSuccess?.();
    closeNotificationModal();
  }, [options, closeNotificationModal]);

  return (
    <NotificationModalContext.Provider
      value={{ openNotificationModal, closeNotificationModal }}
    >
      {children}
      {isOpen && (
        <NotificationOnboardingModal
          vesselId={options.vesselId}
          onSuccess={handleSuccess}
          onClose={closeNotificationModal}
        />
      )}
    </NotificationModalContext.Provider>
  );
}
