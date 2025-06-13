window.addEventListener('load', async () => {
    const userStatusDiv = document.getElementById('user-status');
    const loginButton = document.getElementById('login-button');
    const logoutButtonPlaceholder = document.getElementById('logout-button-placeholder'); // Assuming a placeholder for a dedicated logout button
    const guildsListDiv = document.getElementById('guilds-list');
    const automodRulesSection = document.getElementById('automod-rules-section');
    const automodGuildName = document.getElementById('automod-guild-name');
    const automodRulesForm = document.getElementById('automod-rules-form');
    const saveButton = document.getElementById('save-automod-rules');

    let currentGuildId = null;

    // Helper to ensure elements exist before manipulating
    const ensureElement = (id) => {
        let el = document.getElementById(id);
        if (!el) {
            console.warn(`Element with ID '${id}' not found. Creating a placeholder.`);
            el = document.createElement('div'); // Or button, etc.
            el.id = id;
            // You might want to append it somewhere visible for debugging if it's critical
            // document.body.appendChild(el);
        }
        return el;
    };

    // Re-assign using the helper to be safe, though ideally they exist
    // const userStatusDiv = ensureElement('user-status');
    // const loginButton = ensureElement('login-button');
    // etc. for other critical elements if they might be missing.
    // For this implementation, we'll assume the subtask that created index.html made them.

    async function checkLoginStatus() {
        try {
            const response = await fetch('/api/me');
            console.log('Respuesta de /api/me:', response.status, response.statusText);

            // Default UI state: not logged in
            if (loginButton) loginButton.style.display = 'block';
            if (logoutButtonPlaceholder) logoutButtonPlaceholder.innerHTML = ''; // Clear any old logout button
            if (guildsListDiv) guildsListDiv.style.display = 'none';
            if (automodRulesSection) automodRulesSection.style.display = 'none';
            if (saveButton) saveButton.style.display = 'none';

            if (response.ok) {
                const user = await response.json();
                if (userStatusDiv) {
                    userStatusDiv.innerHTML = `<p>Logueado como: ${user.username}#${user.discriminator}</p>`;
                }
                if (loginButton) loginButton.style.display = 'none';
                if (logoutButtonPlaceholder) {
                     logoutButtonPlaceholder.innerHTML = `<button onclick="window.location.href='/auth/logout'">Logout</button>`;
                }
                if (guildsListDiv) {
                    guildsListDiv.style.display = 'block';
                    loadGuilds(user.guilds);
                }
            } else if (response.status === 401) {
                console.log('Detectado 401, mostrando botón de login.');
                if (userStatusDiv) {
                     userStatusDiv.innerHTML = "<p>No estás logueado. Por favor, inicia sesión para gestionar tus servidores.</p>";
                }
                // Login button should already be visible from default UI state above
                // Clear sensitive data areas
                if (guildsListDiv) guildsListDiv.innerHTML = '';
                if (automodRulesForm) automodRulesForm.innerHTML = '';

            } else {
                const errorText = await response.text();
                console.error('Error del servidor al verificar login:', response.status, errorText);
                if (userStatusDiv) userStatusDiv.innerHTML = `<p>Error al verificar el estado de login: ${response.status}. ${errorText}. Intenta recargar.</p>`;
                if (guildsListDiv) guildsListDiv.innerHTML = '';
                if (automodRulesForm) automodRulesForm.innerHTML = '';
            }
        } catch (error) {
            console.error('Error de red o JS en checkLoginStatus:', error);
            if (userStatusDiv) userStatusDiv.innerHTML = '<p>Error al conectar con el servidor. Verifica tu conexión e intenta recargar.</p>';
            if (loginButton && loginButton.style.display !== 'block') { // Show login if hidden
                 loginButton.style.display = 'block';
            }
            if (guildsListDiv) {
                guildsListDiv.innerHTML = '';
                guildsListDiv.style.display = 'none';
            }
            if (automodRulesSection) automodRulesSection.style.display = 'none';
            if (saveButton) saveButton.style.display = 'none';
        }
    }

    function loadGuilds(guilds) {
        if (!guildsListDiv) return;
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
        if (!automodRulesSection || !automodGuildName || !automodRulesForm || !saveButton) return;

        automodGuildName.textContent = `Configurando AutoMod para: ${guildName}`;
        automodRulesSection.style.display = 'block';
        saveButton.style.display = 'block';
        automodRulesForm.innerHTML = '<p>Cargando reglas...</p>';

        try {
            const response = await fetch(`/api/guilds/${guildId}/automod/rules`);
            if (!response.ok) {
                throw new Error(`Error al cargar reglas: ${response.statusText}`);
            }
            const rules = await response.json();
            renderAutoModForm(rules);
        } catch (error) {
            console.error('Error en loadAutoModRules:', error);
            automodRulesForm.innerHTML = `<p>Error al cargar reglas: ${error.message}</p>`;
        }
    }

    function renderAutoModForm(rulesData) {
        if (!automodRulesForm) return;
        automodRulesForm.innerHTML = ''; // Clear previous form or loading message

        const knownRules = {
            banned_words: { label: 'Palabras Prohibidas (separadas por coma)', type: 'textarea' },
            anti_spam: { label: 'Anti-Spam (mensajes máximos en 5s, 0 para desactivar)', type: 'number' },
            anti_mention: { label: 'Anti-Menciones (máximo de menciones, 0 para desactivar)', type: 'number' },
            anti_link: { label: 'Anti-Enlaces (lista blanca de dominios separados por coma, ej: youtube.com,google.com. Dejar vacío para bloquear todos los enlaces excepto los de la lista blanca. Si no se define esta regla, todos los enlaces son permitidos)', type: 'textarea' }
        };

        // Create a mapping from rule_type to rule_value for easy lookup
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
            automodRulesForm.appendChild(div);
        }
    }

    if (saveButton) {
        saveButton.onclick = async () => {
            if (!currentGuildId || !automodRulesForm) return;

            const formData = new FormData(automodRulesForm); // This won't work directly for our dynamically created form
            const updatedRules = {};

            // Iterate over the inputs in the form
            const inputs = automodRulesForm.querySelectorAll('input, textarea');
            inputs.forEach(input => {
                // Only include rules that have a value or are numbers (to allow setting to 0)
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
                // Optionally, reload rules to confirm
                // loadAutoModRules(currentGuildId, automodGuildName.textContent.replace('Configurando AutoMod para: ', ''));
            } catch (error) {
                console.error('Error en saveButton.onclick:', error);
                alert(`Error al guardar reglas: ${error.message}`);
            }
        };
    }

    // Initial check
    checkLoginStatus();
});
