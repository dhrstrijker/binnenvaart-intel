"""Abstract base class for all competition models."""

from abc import ABC, abstractmethod
import numpy as np


class BaseModel(ABC):
    """Interface that all competing models must implement."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Short human-readable model name."""
        ...

    @abstractmethod
    def fit(self, X_train, y_train):
        """
        Train the model.

        Parameters
        ----------
        X_train : pd.DataFrame
            Training features (ALL columns from extracted CSV).
            Model selects what it needs internally.
        y_train : pd.Series
            Training target (price in EUR).
        """
        ...

    @abstractmethod
    def predict(self, X) -> np.ndarray:
        """
        Generate predictions.

        Parameters
        ----------
        X : pd.DataFrame
            Features (same columns as X_train).

        Returns
        -------
        np.ndarray
            Predicted prices. Use np.nan for rows where prediction
            isn't possible (missing required features).
        """
        ...

    @abstractmethod
    def describe(self) -> dict:
        """
        Return a description of the fitted model.

        Should include at minimum:
        - 'features_used': list of feature names
        - 'n_parameters': approximate parameter count
        - 'approach': short text description
        """
        ...

    def export_for_frontend(self) -> dict | None:
        """
        Optional: export model in a format usable by the frontend.

        For linear models, return TYPE_COEFFICIENTS dict.
        For tree models, return pre-computed predictions dict.
        Returns None if not applicable.
        """
        return None
