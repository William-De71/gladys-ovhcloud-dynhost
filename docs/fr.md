# OVHcloud DynHost

## Présentation

Cette intégration fait de Gladys le **client DNS dynamique** de votre **domaine OVHcloud**. Votre fournisseur d’accès peut changer à tout moment l’adresse publique de votre maison ; avec **DynHost**, un nom de votre domaine (`maison.exemple.fr`) pointe toujours vers elle, pour joindre votre maison, un NAS ou un VPN par son nom. Gladys vérifie l’adresse publique toutes les 5 minutes par défaut et ne demande à OVHcloud de mettre le nom à jour que si elle a changé.

Jusqu’à **trois noms**, chacun suivant l’adresse **IPv4** (enregistrement A), l’adresse **IPv6** (enregistrement AAAA) ou les deux. Chaque nom devient un appareil avec ses adresses, son état et le nombre de changements ; des scènes peuvent réagir quand l’adresse publique change ou qu’une mise à jour échoue, et un widget de tableau de bord résume le tout.

Elle utilise le point d’accès officiel **DynHost** d’OVHcloud avec un identifiant DynHost, le même que celui des box et de ddclient. C’est une intégration **cloud** : l’adresse publique est lue sur des services d’écho (ipify, icanhazip, ident.me), et OVHcloud n’est contacté que si un enregistrement doit changer.

## Prérequis

- Gladys Assistant 5.3.0 ou plus récent.
- Un domaine chez OVHcloud dont la zone DNS est gérée par OVHcloud.
- Dans l’espace client OVHcloud, votre domaine → onglet **DynHost** :
  1. **Gérer les accès** → **Créer un identifiant** : un suffixe (l’identifiant devient `exemple.fr-suffixe`), le sous-domaine qu’il peut mettre à jour (`maison`, ou `*` pour tous les noms du domaine) et un mot de passe.
  2. **Ajouter un DynHost** : le sous-domaine (`maison`, vide pour le domaine lui-même) et l’adresse actuelle. Un enregistrement A ou AAAA du même nom ne doit pas déjà exister : supprimez-le d’abord.
  3. Pour l’IPv6, ajoutez un second DynHost de type AAAA pour le même nom.

## Configuration

| Champ                              | Ce qu’il faut saisir                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Nom DynHost                        | Le nom complet : `maison.exemple.fr`, ou `exemple.fr` pour le domaine lui-même.                          |
| Identifiant DynHost                | L’identifiant de **Gérer les accès** (`exemple.fr-maison`). Vide pour le 2e et le 3e nom : celui du 1er. |
| Mot de passe                       | Le mot de passe de cet identifiant (pas celui de votre compte OVHcloud).                                 |
| Enregistrements à mettre à jour    | IPv4 (A, par défaut), IPv6 (AAAA), ou les deux.                                                          |
| Vérification de l’adresse publique | Toutes les minutes, 5 minutes (par défaut), 15 ou 30 minutes.                                            |
| Langue des textes                  | Noms d’appareils, état et résumés de scène. Automatique suit votre tableau de bord.                      |

Appuyez sur **Tester la connexion** : chaque enregistrement est envoyé tout de suite à OVHcloud, et la réponse indique, nom par nom, « déjà 203.0.113.7 » (l’identifiant fonctionne), la nouvelle adresse, ou l’erreur. **Diagnostic** écrit ce que sait l’intégration dans l’onglet Journaux, mots de passe masqués.

## Utilisation

### Appareils

Dans **Découverte**, créez un appareil par nom :

| Fonctionnalité                     | Contenu                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| Adresse IPv4 (enregistrement A)    | L’adresse confirmée par OVHcloud pour le nom.                                           |
| Adresse IPv6 (enregistrement AAAA) | La même pour l’IPv6, si le nom la suit.                                                 |
| État du DynHost                    | « À jour », « En attente de la première vérification » ou la dernière erreur, en clair. |
| Changements d’adresse              | Le nombre de mises à jour appliquées par OVHcloud ; son historique montre quand.        |

### Widget de tableau de bord

**DynHost** affiche l’IPv4 publique (et l’IPv6), puis chaque enregistrement avec son état, l’heure de la dernière vérification et un bouton **Mettre à jour**.

![Le widget DynHost, tous les enregistrements à jour, puis un identifiant refusé (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-ovhcloud-dynhost/main/docs/assets/widgets.fr.png)

### Scènes

Déclencheurs :

- **Adresse publique changée** : avec l’ancienne et la nouvelle adresse ; filtre : IPv4 ou IPv6.
- **Enregistrement mis à jour** : OVHcloud a pointé un nom vers une nouvelle adresse ; filtres : nom, IPv4 ou IPv6.
- **Échec de mise à jour** : une fois par erreur, pas à chaque vérification ; filtres : nom, erreur (identifiant refusé, nom inconnu, bloqué, OVHcloud injoignable, adresse publique inconnue…).

Actions :

- **Mettre à jour** : un nom ou tous, éventuellement même s’ils sont déjà à jour (au plus une fois par minute et par enregistrement) ; donne les nombres et un résumé. Elle ne lance jamais de déclencheur.
- **Lire l’adresse publique** : l’IPv4 et l’IPv6 publiques, à mettre dans un message.

Exemples :

- « Adresse publique changée » → envoyer « Nouvelle adresse : {{triggerEvent.data.ip}} » sur votre téléphone.
- « Échec de mise à jour », erreur « identifiant refusé » → vous prévenir de vérifier le mot de passe DynHost.
- Chaque matin → « lire l’adresse publique » → l’écrire dans un message.

### Transport

Cloud uniquement : l’adresse publique est lue sur `api.ipify.org`, `ipv4.icanhazip.com` et `v4.ident.me` (le suivant si l’un échoue ; leurs équivalents IPv6 pour l’IPv6), et les enregistrements sont envoyés à `dns.eu.ovhapis.com` en HTTPS avec votre identifiant DynHost. Ces services ne voient que l’adresse de votre maison. Rien d’autre ne quitte votre réseau.

## Dépannage

- **Identifiant ou mot de passe refusé** : l’identifiant est `domaine-suffixe` (`exemple.fr-maison`), et le mot de passe celui de cet identifiant. Après un refus, l’intégration n’insiste pas (OVHcloud bloque les clients qui insistent) : corrigez la configuration, elle réessaie aussitôt.
- **Aucun DynHost pour ce nom** : le DynHost n’existe pas, ou l’identifiant ne couvre qu’un autre sous-domaine. Créez le DynHost dans l’onglet, ou un identifiant avec le sous-domaine `*`.
- **Bloqué : trop de mises à jour** : OVHcloud a refusé des mises à jour trop fréquentes. Patientez, et évitez qu’un autre client (box, ddclient) mette à jour le même nom.
- **IPv6 publique inconnue** : le Docker de Gladys n’a pas d’accès IPv6 à internet. Gardez l’IPv4 seule pour ce nom.
- **Le nom pointe vers la bonne adresse mais la maison est injoignable** : votre fournisseur partage peut-être une IPv4 entre plusieurs foyers (CGNAT) ; demandez une IPv4 complète, ou passez par l’IPv6.
- Pour signaler un problème, donnez les versions de Gladys et de l’intégration et les lignes du bouton **Diagnostic**.
