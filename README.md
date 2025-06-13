# Discord Bot DX

Este es un bot multifuncional para Discord con varias características avanzadas, incluyendo moderación, música, sistema de niveles y más.

## Dashboard Web para Configuración

### Introducción
El dashboard web integrado permite a los administradores de servidor configurar fácilmente las reglas de AutoMod para sus respectivos servidores de Discord a través de una interfaz gráfica amigable.

### Configuración Inicial
La configuración del bot y del dashboard web se gestiona principalmente a través del archivo `config.js` ubicado en la raíz del proyecto. Este archivo utiliza el paquete `dotenv` para cargar automáticamente valores desde un archivo `.env` si existe.

**Pasos recomendados para la configuración:**

1.  **Crear un archivo `.env`**: En la raíz del proyecto, crea un archivo llamado `.env`. Este archivo es ignorado por Git (a través de `.gitignore`, si está configurado) y es ideal para almacenar tus credenciales y configuraciones locales.
2.  **Poblar el archivo `.env`**: Añade las siguientes variables a tu archivo `.env`, reemplazando los valores de ejemplo con tus propias credenciales:

    ```env
    # Token de tu Bot de Discord
    TOKEN=tu_token_de_bot_aqui

    # Credenciales de la Aplicación de Discord para OAuth2 (Dashboard Web)
    DISCORD_CLIENT_ID=tu_id_de_cliente_aqui
    DISCORD_CLIENT_SECRET=tu_secreto_de_cliente_aqui
    DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback # Ajusta si tu puerto o dominio es diferente

    # Secreto para las sesiones del Dashboard Web
    SESSION_SECRET=una_cadena_larga_aleatoria_y_segura_para_las_sesiones

    # Puerto para el Dashboard Web (opcional, por defecto es 3000)
    PORT=3000
    ```

3.  **Entender `config.js`**:
    *   El archivo `config.js` intentará leer estas variables desde tu `.env`.
    *   Si alguna variable no se encuentra en `.env`, `config.js` proporcionará valores placeholder o por defecto (ej. para `discordRedirectUri` y `webServerPort`).
    *   **Es crucial que `TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, y `SESSION_SECRET` estén correctamente configurados, ya sea en `.env` o directamente en `config.js` (aunque no se recomienda para producción o si compartes el código).**

**Variables de Configuración Clave (a través de `.env` o en `config.js`):**

-   `token`: El token de tu bot de Discord. Esencial para que el bot se conecte.
-   `discordClientId`: El ID de Cliente de tu aplicación de Discord.
-   `discordClientSecret`: El Secreto de Cliente de tu aplicación de Discord.
-   `discordRedirectUri`: La URI de redirección OAuth2.
    *   Para desarrollo local: `http://localhost:3000/auth/discord/callback` (si usas el puerto 3000).
    *   Para producción: Deberá ser la URL pública donde tu dashboard esté accesible, seguida de `/auth/discord/callback`.
-   `sessionSecret`: Una cadena larga, aleatoria y segura utilizada para proteger las sesiones de usuario. ¡Cámbiala del valor por defecto!
-   `webServerPort`: El puerto en el que se ejecutará el servidor web. Se toma de la variable de entorno `PORT` o usa `3000` por defecto.

**Cómo obtener las credenciales de Discord (`token`, `discordClientId`, `discordClientSecret`):**
1.  Ve al [Portal de Desarrolladores de Discord](https://discord.com/developers/applications).
2.  Crea una "Nueva Aplicación" o selecciona una existente.
3.  **Para el `token` del bot**:
    *   Navega a la pestaña "Bot".
    *   Haz clic en "Add Bot" (si es una nueva aplicación).
    *   Puedes ver/copiar el token haciendo clic en "Reset Token" o "View Token" (si ya existe). ¡Trata este token como una contraseña!
4.  **Para `discordClientId` y `discordClientSecret`**:
    *   Navega a la pestaña "OAuth2" -> "General".
    *   Aquí encontrarás el "CLIENT ID" (`discordClientId`).
    *   Puedes ver/copiar el "CLIENT SECRET" (`discordClientSecret`) haciendo clic en "Reset Secret".
5.  **Para `discordRedirectUri`**:
    *   En la misma pestaña "OAuth2" -> "General", en la sección "Redirects", añade la URI completa. Por ejemplo: `http://localhost:3000/auth/discord/callback`. Asegúrate de que esta URI coincida exactamente con la que configuras en `DISCORD_REDIRECT_URI` en tu archivo `.env` o `config.js`.

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
