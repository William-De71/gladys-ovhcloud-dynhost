# OVHcloud DynHost

## Presentación

Esta integración convierte a Gladys en el **cliente de DNS dinámico** de tu **dominio OVHcloud**. Tu proveedor de internet puede cambiar en cualquier momento la dirección pública de tu casa; con **DynHost**, un nombre de tu dominio (`casa.ejemplo.es`) apunta siempre a ella, para acceder a tu casa, a un NAS o a una VPN por su nombre. Gladys comprueba la dirección pública cada 5 minutos por defecto y solo pide a OVHcloud que actualice el nombre cuando ha cambiado.

Hasta **tres nombres**, cada uno siguiendo la dirección **IPv4** (registro A), la dirección **IPv6** (registro AAAA) o ambas. Cada nombre se convierte en un dispositivo con sus direcciones, su estado y el número de cambios; las escenas pueden reaccionar cuando cambia la dirección pública o falla una actualización, y un widget del panel lo resume todo.

Usa el punto de acceso oficial **DynHost** de OVHcloud con un identificador DynHost, el mismo que usan los routers y ddclient. Es una integración **cloud**: la dirección pública se lee en servicios de eco (ipify, icanhazip, ident.me), y solo se contacta con OVHcloud cuando un registro debe cambiar.

## Requisitos

- Gladys Assistant 5.3.0 o posterior.
- Un dominio en OVHcloud cuya zona DNS gestione OVHcloud.
- En el área de cliente de OVHcloud, tu dominio → pestaña **DynHost**:
  1. **Gestionar los accesos** → **Crear un identificador**: un sufijo (el identificador queda `ejemplo.es-sufijo`), el subdominio que puede actualizar (`casa`, o `*` para todos los nombres del dominio) y una contraseña.
  2. **Añadir un DynHost**: el subdominio (`casa`, vacío para el propio dominio) y la dirección actual. No debe existir ya un registro A o AAAA con el mismo nombre: bórralo antes.
  3. Para IPv6, añade un segundo DynHost de tipo AAAA para el mismo nombre.

## Configuración

| Campo                                | Qué introducir                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Nombre DynHost                       | El nombre completo: `casa.ejemplo.es`, o `ejemplo.es` para el propio dominio.                                   |
| Identificador DynHost                | El identificador de **Gestionar los accesos** (`ejemplo.es-casa`). Vacío para el 2.º y 3.er nombre: el del 1.º. |
| Contraseña                           | La contraseña de este identificador (no la de tu cuenta OVHcloud).                                              |
| Registros que actualizar             | IPv4 (A, por defecto), IPv6 (AAAA) o ambos.                                                                     |
| Comprobación de la dirección pública | Cada minuto, cada 5 minutos (por defecto), 15 o 30 minutos.                                                     |
| Idioma de los textos                 | Nombres de dispositivos, estado y resúmenes de escena. Automático sigue tu panel.                               |

Pulsa **Probar la conexión**: cada registro se envía al instante a OVHcloud, y la respuesta indica, nombre por nombre, «ya 203.0.113.7» (el identificador funciona), la nueva dirección o el error. **Diagnóstico** escribe lo que sabe la integración en la pestaña Registros, con las contraseñas ocultas.

## Uso

### Dispositivos

En **Detección**, crea un dispositivo por nombre:

| Función                        | Contenido                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| Dirección IPv4 (registro A)    | La dirección confirmada por OVHcloud para el nombre.                               |
| Dirección IPv6 (registro AAAA) | Lo mismo para IPv6, si el nombre la sigue.                                         |
| Estado del DynHost             | «Actualizado», «Esperando la primera comprobación» o el último error, en palabras. |
| Cambios de dirección           | El número de actualizaciones aplicadas por OVHcloud; su historial muestra cuándo.  |

### Widget del panel

**DynHost** muestra la IPv4 pública (y la IPv6), luego cada registro con su estado, la hora de la última comprobación y un botón **Actualizar ahora**.

![El widget DynHost, todos los registros al día, y después un identificador rechazado (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-ovhcloud-dynhost/main/docs/assets/widgets.es.png)

### Escenas

Disparadores:

- **Dirección pública cambiada**: con la dirección anterior y la nueva; filtro: IPv4 o IPv6.
- **Registro actualizado**: OVHcloud apuntó un nombre a una nueva dirección; filtros: nombre, IPv4 o IPv6.
- **Fallo de actualización**: una vez por error, no en cada comprobación; filtros: nombre, error (identificador rechazado, nombre desconocido, bloqueado, OVHcloud inaccesible, dirección pública desconocida…).

Acciones:

- **Actualizar ahora**: un nombre o todos, incluso si ya están al día (como máximo una vez por minuto y registro); devuelve los recuentos y un resumen. Nunca lanza un disparador.
- **Leer la dirección pública**: la IPv4 y la IPv6 públicas, para ponerlas en un mensaje.

Ejemplos:

- «Dirección pública cambiada» → enviar «Nueva dirección: {{triggerEvent.data.ip}}» a tu teléfono.
- «Fallo de actualización», error «identificador rechazado» → avisarte para revisar la contraseña DynHost.
- Cada mañana → «leer la dirección pública» → escribirla en un mensaje.

### Transporte

Solo cloud: la dirección pública se lee en `api.ipify.org`, `ipv4.icanhazip.com` y `v4.ident.me` (el siguiente si uno falla; sus equivalentes IPv6 para IPv6), y los registros se envían a `dns.eu.ovhapis.com` por HTTPS con tu identificador DynHost. Esos servicios solo ven la dirección de tu casa. Nada más sale de tu red.

## Solución de problemas

- **Identificador o contraseña rechazados**: el identificador es `dominio-sufijo` (`ejemplo.es-casa`), y la contraseña la de este identificador. Tras un rechazo, la integración no insiste (OVHcloud bloquea a los clientes que insisten): corrige la configuración y vuelve a intentarlo enseguida.
- **Ningún registro DynHost para este nombre**: el DynHost no existe, o el identificador solo cubre otro subdominio. Crea el DynHost en la pestaña, o un identificador con el subdominio `*`.
- **Bloqueado: demasiadas actualizaciones**: OVHcloud rechazó actualizaciones demasiado frecuentes. Espera, y evita que otro cliente (router, ddclient) actualice el mismo nombre.
- **IPv6 pública desconocida**: el Docker de Gladys no tiene acceso IPv6 a internet. Deja solo IPv4 para este nombre.
- **El nombre apunta a la dirección correcta pero la casa no responde**: tu proveedor quizá comparta una IPv4 entre varios hogares (CGNAT); pide una IPv4 completa, o usa IPv6.
- Para informar de un problema, indica las versiones de Gladys y de la integración y las líneas del botón **Diagnóstico**.
