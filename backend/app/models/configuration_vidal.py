"""
app/models/configuration_vidal.py
--------------------------------------
§ demande utilisateur : Module VIDAL France — recherche médicament,
monographies (RCP), catalogue réglementaire et analyse de prescriptions
(interactions, contre-indications, allergies). L'abonnement VIDAL est celui
de SAWALI SMART SYSTEMS (plateforme), pas celui de chaque cabinet — une
configuration UNIQUE (super-admin), partagée par tous les cabinets actifs,
exactement comme dans le portail SAWALI SMART SYSTEMS de référence
(stockage `settings.global`, ici un document singleton dédié).
"""

from typing import Literal, Optional
from pydantic import BaseModel


class ConfigurationVidal(BaseModel):
    module_actif: bool = False
    mode_actif: Literal["test", "production"] = "test"

    test_base_url: str = "https://api.vidal.fr/rest/api"
    test_app_id: Optional[str] = None
    test_app_key: Optional[str] = None

    production_base_url: str = "https://api.vidal.fr/rest/api"
    production_app_id: Optional[str] = None
    production_app_key: Optional[str] = None

    ttl_cache_heures: int = 168  # 7 jours, recommandé
    quota_utilisateur_jour: int = 200  # 0 = illimité
    timeout_http_secondes: int = 12  # 2 à 60


class ConfigurationVidalEcriture(BaseModel):
    """
    Écriture partielle (§ pattern déjà utilisé pour ConfigurationWhatsApp/SMTP) :
    les clés secrètes (*_app_key) ne sont jamais retournées en clair par
    l'API — seul un indicateur `*_renseigne` l'est — donc jamais ré-envoyées
    telles quelles depuis le formulaire ; omises ici, elles restent
    inchangées côté serveur.
    """
    module_actif: Optional[bool] = None
    mode_actif: Optional[Literal["test", "production"]] = None
    test_base_url: Optional[str] = None
    test_app_id: Optional[str] = None
    test_app_key: Optional[str] = None
    production_base_url: Optional[str] = None
    production_app_id: Optional[str] = None
    production_app_key: Optional[str] = None
    ttl_cache_heures: Optional[int] = None
    quota_utilisateur_jour: Optional[int] = None
    timeout_http_secondes: Optional[int] = None
