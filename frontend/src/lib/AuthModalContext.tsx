"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import AuthModal from "@/components/AuthModal";

interface AuthModalOptions {
  message?: string;
  onSuccess?: () => void;
}

interface AuthModalContextValue {
  openAuthModal: (options?: AuthModalOptions) => void;
  closeAuthModal: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue>({
  openAuthModal: () => {},
  closeAuthModal: () => {},
});

export function useAuthModal() {
  return useContext(AuthModalContext);
}

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<AuthModalOptions>({});

  const openAuthModal = useCallback((opts?: AuthModalOptions) => {
    setOptions(opts ?? {});
    setIsOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsOpen(false);
    setOptions({});
  }, []);

  const handleSuccess = useCallback(() => {
    options.onSuccess?.();
    closeAuthModal();
  }, [options, closeAuthModal]);

  return (
    <AuthModalContext.Provider value={{ openAuthModal, closeAuthModal }}>
      {children}
      {isOpen && (
        <AuthModal
          message={options.message}
          onSuccess={handleSuccess}
          onClose={closeAuthModal}
        />
      )}
    </AuthModalContext.Provider>
  );
}
