# Discord Bot DX

Este es un bot multifuncional para Discord con varias características avanzadas, incluyendo moderación, música, sistema de niveles y más.

## Dashboard Web para Configuración

### Introducción
El dashboard web integrado permite a los administradores de servidor configurar fácilmente las reglas de AutoMod para sus respectivos servidores de Discord a través de una interfaz gráfica amigable.

### Configuración Inicial
Para que el bot y el dashboard web funcionen correctamente, es necesario configurar las siguientes variables de entorno:

-   `TOKEN`: El token de tu bot de Discord. Esencial para que el bot se conecte a Discord.
-   `DISCORD_CLIENT_ID`: El ID de cliente de tu aplicación de Discord. Necesario para la autenticación OAuth2 para el dashboard.
-   `DISCORD_CLIENT_SECRET`: El secreto de cliente de tu aplicación de Discord. Necesario para la autenticación OAuth2.
-   `DISCORD_REDIRECT_URI`: La URI de redirección OAuth2 configurada en tu aplicación de Discord. Por defecto, para desarrollo local, debería ser algo como `http://localhost:3000/auth/discord/callback`.
-   `SESSION_SECRET`: Una cadena aleatoria y secreta utilizada para asegurar las sesiones de usuario en el dashboard web.
-   `PORT`: El puerto en el que se ejecutará el servidor web del dashboard (por defecto, 3000 si no se especifica).

**Cómo obtener credenciales de Discord:**
1.  Ve al [Portal de Desarrolladores de Discord](https://discord.com/developers/applications).
2.  Crea una nueva aplicación.
3.  En la pestaña "Bot", crea un bot y copia el `TOKEN`.
4.  En la pestaña "OAuth2" -> "General":
    *   Copia el `CLIENT ID` y el `CLIENT SECRET`.
    *   En la sección "Redirects", añade la URI que usarás (ej. `http://localhost:3000/auth/discord/callback`). Asegúrate de que coincida exactamente con `DISCORD_REDIRECT_URI`.

Se recomienda crear un archivo `.env` en la raíz del proyecto para gestionar estas variables:
```env
TOKEN=tu_token_de_bot
DISCORD_CLIENT_ID=tu_client_id
DISCORD_CLIENT_SECRET=tu_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback
SESSION_SECRET=tu_secreto_de_sesion_muy_seguro
PORT=3000
```

### Acceso y Uso
1.  **Iniciar el Bot y Servidor Web**: Ejecuta `node index.js` en la terminal desde la raíz del proyecto. Esto iniciará tanto el bot de Discord como el servidor web para el dashboard.
2.  **Acceder al Dashboard**: Abre tu navegador y ve a la dirección donde se está ejecutando el servidor (por defecto, `http://localhost:3000`).
3.  **Uso Básico**:
    *   Serás redirigido para iniciar sesión con tu cuenta de Discord.
    *   Una vez autenticado, verás una lista de los servidores donde tienes permisos de administrador.
    *   Haz clic en el nombre de un servidor para ver y editar sus reglas de AutoMod.
    *   Modifica los valores de las reglas según sea necesario.
    *   Haz clic en "Guardar Cambios" para aplicar la nueva configuración.

### Reglas de Automod Configurables
La interfaz del dashboard actualmente permite configurar las siguientes reglas de AutoMod. Estas reglas se guardan y se leen desde `data/automod.json` (o el sistema de almacenamiento configurado).

-   **Palabras Prohibidas (`banned_words`)**:
    -   **Descripción**: Define una lista de palabras que serán automáticamente eliminadas si un usuario las envía en un mensaje.
    -   **Valor Esperado**: Una cadena de palabras separadas por comas (ej: `palabra1,palabra2,palabra3`). El sistema convertirá esto en una lista para su procesamiento.
-   **Anti-Spam (`anti_spam`)**:
    -   **Descripción**: Define el número máximo de mensajes que un usuario puede enviar en un corto período de tiempo (actualmente 5 segundos en la implementación `checkMessage` en `utils/moderation.js`). Superar este límite se considera spam.
    -   **Valor Esperado**: Un número entero (ej: `5` para 5 mensajes).
-   **Anti-Menciones (`anti_mention`)**:
    -   **Descripción**: Define el número máximo de menciones (a usuarios o roles) permitidas en un solo mensaje.
    -   **Valor Esperado**: Un número entero (ej: `3` para 3 menciones).
-   **Anti-Enlaces (`anti_link`)**:
    -   **Descripción**: Define una lista de dominios permitidos. Si un mensaje contiene un enlace a un dominio que no está en esta lista, el mensaje será eliminado.
    -   **Valor Esperado**: Una cadena de dominios separados por comas (ej: `youtube.com,discord.gg`). Si se quiere permitir cualquier enlace, esta regla podría dejarse vacía o configurarse con un valor especial que el bot interprete como "permitir todos" (actualmente la lógica es de lista de permitidos, no de bloqueo).

*(Nota: La implementación exacta y el comportamiento de estas reglas dependen de la lógica definida en `utils/moderation.js` y `utils/storage.js`)*.
