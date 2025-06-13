window.addEventListener('load', async () => {
    // Initial element fetching - these are assumed to exist from index.html
    const initialUserStatusDiv = document.getElementById('user-status');
    const initialLoginButton = document.getElementById('login-button'); // Static login button from HTML
    const logoutButtonPlaceholder = document.getElementById('logout-button-placeholder');
    const initialGuildsListDiv = document.getElementById('guilds-list');
    const initialAutomodRulesSection = document.getElementById('automod-rules-section');
    const automodGuildName = document.getElementById('automod-guild-name');
    const automodRulesForm = document.getElementById('automod-rules-form');
    const initialSaveButton = document.getElementById('save-automod-rules');

    let currentGuildId = null;

    // Helper (not strictly needed for this task as elements are fetched once, but good for thought)
    // const ensureElement = (id) => document.getElementById(id);

    async function checkLoginStatus() {
        try {
            const response = await fetch('/api/me');
            console.log('Respuesta de /api/me:', response.status, response.statusText);

            // Default UI state: prepare for not logged in, but don't assume yet
            // We will explicitly set visibility based on response.
            // Hide sections that depend on login or guild selection by default.
            if (initialGuildsListDiv) initialGuildsListDiv.style.display = 'none';
            if (initialAutomodRulesSection) initialAutomodRulesSection.style.display = 'none';
            if (initialSaveButton) initialSaveButton.style.display = 'none';
            if (logoutButtonPlaceholder) logoutButtonPlaceholder.innerHTML = '';


            if (response.ok) {
                const user = await response.json();
                const userStatusDiv = document.getElementById('user-status'); // Re-fetch for safety, or use initialUserStatusDiv
                if (userStatusDiv) {
                    userStatusDiv.innerHTML = `<p>Logueado como: ${user.username}#${user.discriminator}</p>`;
                }

                const loginButton = document.getElementById('login-button'); // Re-fetch or use initialLoginButton
                if (loginButton) loginButton.style.display = 'none'; // Hide static login button

                if (logoutButtonPlaceholder) { // Use the placeholder for the logout button
                     logoutButtonPlaceholder.innerHTML = `<button onclick="window.location.href='/auth/logout'">Logout</button>`;
                } else if (userStatusDiv) { // Fallback if placeholder doesn't exist, append to userStatusDiv
                    userStatusDiv.innerHTML += ` <button onclick="window.location.href='/auth/logout'">Logout</button>`;
                }


                const guildsListDiv = document.getElementById('guilds-list'); // Re-fetch or use initialGuildsListDiv
                if (guildsListDiv) {
                    guildsListDiv.style.display = 'block';
                    loadGuilds(user.guilds);
                }
            } else if (response.status === 401) {
                // --- Start of the new detailed 401 block ---
                console.log('Detectado 401. Intentando modificar user-status.');
                const userStatusDiv = document.getElementById('user-status'); // Re-fetch critical element

                if (userStatusDiv) {
                    console.log('user-status div ENCONTRADO. Modificando innerHTML...');
                    // Note: inline onclick is generally not recommended vs addEventListener, but for this specific debug injection:
                    userStatusDiv.innerHTML = '<p>No estás logueado.</p><button id="login-button-dinamico" onclick="window.location.href=\'/auth/discord\'">Login con Discord (Dinámico)</button>';

                    const botonCreado = document.getElementById('login-button-dinamico');
                    if (botonCreado) {
                        console.log('Botón DINÁMICO añadido al DOM y encontrado.');
                    } else {
                        console.error('ERROR: Botón dinámico NO encontrado en el DOM después de innerHTML.');
                        console.log('Contenido de userStatusDiv.innerHTML AHORA:', userStatusDiv.innerHTML);
                    }
                } else {
                    console.error('ERROR CRÍTICO: user-status div NO encontrado en el DOM en el bloque 401.');
                }

                // Hide other sections safely
                const guildsListDiv = document.getElementById('guilds-list'); // Re-fetch
                if (guildsListDiv) {
                    guildsListDiv.innerHTML = '';
                    guildsListDiv.style.display = 'none';
                }
                const automodRulesSection = document.getElementById('automod-rules-section'); // Re-fetch
                if (automodRulesSection) automodRulesSection.style.display = 'none';
                const saveButton = document.getElementById('save-automod-rules'); // Re-fetch
                if (saveButton) saveButton.style.display = 'none';

                // Clear logout button if it was somehow populated
                if (logoutButtonPlaceholder) logoutButtonPlaceholder.innerHTML = '';


                // Handling the static login button from HTML (id="login-button")
                const staticLoginButton = document.getElementById('login-button');
                if (staticLoginButton) { // If a static button with id="login-button" exists
                    console.log('Manejando botón de login estático (login-button)...');
                    // If userStatusDiv is successfully updated with a dynamic button,
                    // the static one might be redundant or confusing.
                    // If the dynamic button creation failed, the static one might be the only way to log in.
                    if (userStatusDiv && document.getElementById('login-button-dinamico')) {
                        // Dynamic button exists, hide the static one to prevent confusion
                        staticLoginButton.style.display = 'none';
                        console.log('Botón dinámico existe, ocultando botón estático.');
                    } else {
                        // Dynamic button doesn't exist (or userStatusDiv doesn't), ensure static one is visible as fallback
                        staticLoginButton.style.display = 'block';
                        console.log('Botón dinámico NO existe (o userStatusDiv no), mostrando botón estático como fallback.');
                    }
                } else {
                    console.log('Botón de login estático (login-button) NO encontrado en el DOM.');
                }
                // --- End of the new detailed 401 block ---

            } else { // Handle other non-OK, non-401 server errors
                const errorText = await response.text();
                console.error('Error del servidor al verificar login:', response.status, errorText);
                const userStatusDiv = document.getElementById('user-status');
                if (userStatusDiv) userStatusDiv.innerHTML = `<p>Error al verificar el estado de login: ${response.status}. ${errorText}. Intenta recargar.</p>`;

                // Hide everything else, ensure no login button confusion
                const guildsListDiv = document.getElementById('guilds-list');
                if (guildsListDiv) { guildsListDiv.innerHTML = ''; guildsListDiv.style.display = 'none'; }
                const automodRulesSection = document.getElementById('automod-rules-section');
                if (automodRulesSection) automodRulesSection.style.display = 'none';
                const saveButton = document.getElementById('save-automod-rules');
                if (saveButton) saveButton.style.display = 'none';
                const loginButton = document.getElementById('login-button');
                if (loginButton) loginButton.style.display = 'none'; // Hide static login button on server error
                if (logoutButtonPlaceholder) logoutButtonPlaceholder.innerHTML = '';

            }
        } catch (error) { // Network errors or JS errors during the try block
            console.error('Error de red o JS en checkLoginStatus:', error);
            const userStatusDiv = document.getElementById('user-status');
            if (userStatusDiv) userStatusDiv.innerHTML = '<p>Error al conectar con el servidor. Verifica tu conexión e intenta recargar.</p>';

            // Show static login button as a possible recovery action
            const loginButton = document.getElementById('login-button');
            if (loginButton) loginButton.style.display = 'block';

            // Hide other sections
            const guildsListDiv = document.getElementById('guilds-list');
            if (guildsListDiv) { guildsListDiv.innerHTML = ''; guildsListDiv.style.display = 'none';}
            const automodRulesSection = document.getElementById('automod-rules-section');
            if (automodRulesSection) automodRulesSection.style.display = 'none';
            const saveButton = document.getElementById('save-automod-rules');
            if (saveButton) saveButton.style.display = 'none';
            if (logoutButtonPlaceholder) logoutButtonPlaceholder.innerHTML = '';
        }
    }

    function loadGuilds(guilds) {
        const guildsListDiv = document.getElementById('guilds-list');
        if (!guildsListDiv) {
            console.error("Elemento guilds-list no encontrado en loadGuilds.");
            return;
        }
        guildsListDiv.innerHTML = '<h3>Tus Servidores (Admin):</h3>';
        const ul = document.createElement('ul');

        const adminGuilds = guilds.filter(g => (parseInt(g.permissions) & 0x8) === 0x8);

        if (adminGuilds.length === 0) {
            ul.innerHTML = '<li>No se encontraron servidores donde seas administrador y el bot esté presente.</li>';
        } else {
            adminGuilds.forEach(guild => {
                const li = document.createElement('li');
                const button = document.createElement('button');
                button.textContent = guild.name;
                button.onclick = () => loadAutoModRules(guild.id, guild.name);
                li.appendChild(button);
                ul.appendChild(li);
            });
        }
        guildsListDiv.appendChild(ul);
    }

    async function loadAutoModRules(guildId, guildName) {
        currentGuildId = guildId;
        // Re-fetch elements here as well, or pass them, or use initially fetched ones if guaranteed to exist.
        const automodRulesSectionElem = document.getElementById('automod-rules-section');
        const automodGuildNameElem = document.getElementById('automod-guild-name');
        const automodRulesFormElem = document.getElementById('automod-rules-form');
        const saveButtonElem = document.getElementById('save-automod-rules');

        if (!automodRulesSectionElem || !automodGuildNameElem || !automodRulesFormElem || !saveButtonElem) {
            console.error("Faltan elementos del DOM en loadAutoModRules.");
            return;
        }

        automodGuildNameElem.textContent = `Configurando AutoMod para: ${guildName}`;
        automodRulesSectionElem.style.display = 'block';
        saveButtonElem.style.display = 'block';
        automodRulesFormElem.innerHTML = '<p>Cargando reglas...</p>';

        try {
            const response = await fetch(`/api/guilds/${guildId}/automod/rules`);
            if (!response.ok) {
                throw new Error(`Error al cargar reglas: ${response.statusText}`);
            }
            const rules = await response.json();
            renderAutoModForm(rules);
        } catch (error) {
            console.error('Error en loadAutoModRules:', error);
            if (automodRulesFormElem) automodRulesFormElem.innerHTML = `<p>Error al cargar reglas: ${error.message}</p>`;
        }
    }

    function renderAutoModForm(rulesData) {
        const automodRulesFormElem = document.getElementById('automod-rules-form');
        if (!automodRulesFormElem) {
            console.error("Elemento automod-rules-form no encontrado en renderAutoModForm.");
            return;
        }
        automodRulesFormElem.innerHTML = '';

        const knownRules = {
            banned_words: { label: 'Palabras Prohibidas (separadas por coma)', type: 'textarea' },
            anti_spam: { label: 'Anti-Spam (mensajes máximos en 5s, 0 para desactivar)', type: 'number' },
            anti_mention: { label: 'Anti-Menciones (máximo de menciones, 0 para desactivar)', type: 'number' },
            anti_link: { label: 'Anti-Enlaces (lista blanca de dominios separados por coma, ej: youtube.com,google.com. Dejar vacío para bloquear todos los enlaces excepto los de la lista blanca. Si no se define esta regla, todos los enlaces son permitidos)', type: 'textarea' }
        };

        const currentRules = {};
        if (Array.isArray(rulesData)) {
            rulesData.forEach(rule => {
                currentRules[rule.rule_type] = rule.rule_value;
            });
        }

        for (const ruleKey in knownRules) {
            const ruleConfig = knownRules[ruleKey];
            const div = document.createElement('div');
            div.classList.add('form-group');

            const label = document.createElement('label');
            label.setAttribute('for', `rule-${ruleKey}`);
            label.textContent = ruleConfig.label;
            div.appendChild(label);

            let input;
            if (ruleConfig.type === 'textarea') {
                input = document.createElement('textarea');
            } else {
                input = document.createElement('input');
                input.type = ruleConfig.type;
                if (ruleConfig.type === 'number') input.min = "0";
            }
            input.id = `rule-${ruleKey}`;
            input.name = ruleKey;
            input.value = currentRules[ruleKey] || (ruleConfig.type === 'number' ? '0' : '');

            div.appendChild(input);
            automodRulesFormElem.appendChild(div);
        }
    }

    const saveButtonElem = document.getElementById('save-automod-rules');
    if (saveButtonElem) {
        saveButtonElem.onclick = async () => {
            const automodRulesFormElem = document.getElementById('automod-rules-form');
            if (!currentGuildId || !automodRulesFormElem) {
                console.error("Falta currentGuildId o automodRulesFormElem en saveButton.onclick");
                return;
            }

            const updatedRules = {};
            const inputs = automodRulesFormElem.querySelectorAll('input, textarea');
            inputs.forEach(input => {
                if (input.value.trim() !== '' || input.type === 'number') {
                    updatedRules[input.name] = input.value.trim();
                }
            });

            try {
                const response = await fetch(`/api/guilds/${currentGuildId}/automod/rules`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedRules)
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || `Error al guardar: ${response.statusText}`);
                }
                alert('Reglas guardadas exitosamente!');
            } catch (error) {
                console.error('Error en saveButton.onclick:', error);
                alert(`Error al guardar reglas: ${error.message}`);
            }
        };
    } else {
        console.warn("Botón save-automod-rules no encontrado al asignar evento onclick.");
    }

    // Initial check
    checkLoginStatus();
});
