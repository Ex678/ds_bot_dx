window.addEventListener('load', async () => {
    const userStatusDiv = document.getElementById('user-status');
    const loginButton = document.getElementById('login-button');
    const guildsListDiv = document.getElementById('guilds-list');
    const autoModSection = document.getElementById('automod-rules-section');
    const autoModGuildName = document.getElementById('automod-guild-name');
    const autoModRulesForm = document.getElementById('automod-rules-form');
    const saveAutoModButton = document.getElementById('save-automod-rules');

    const ADMIN_PERMISSION = 0x8; // Administrator permission bit

    loginButton.addEventListener('click', () => {
        window.location.href = '/auth/discord';
    });

    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            const user = await response.json();
            userStatusDiv.innerHTML = `<p>Logged in as: <strong>${user.username}#${user.discriminator}</strong> <a href="/auth/logout">Logout</a></p>`;

            if (user.guilds && user.guilds.length > 0) {
                const adminGuilds = user.guilds.filter(guild => (parseInt(guild.permissions) & ADMIN_PERMISSION) === ADMIN_PERMISSION);

                if (adminGuilds.length > 0) {
                    guildsListDiv.innerHTML = '<ul>' +
                        adminGuilds.map(guild => `<li><button class="guild-button" data-guildid="${guild.id}" data-guildname="${guild.name}">${guild.name}</button></li>`).join('') +
                        '</ul>';

                    document.querySelectorAll('.guild-button').forEach(button => {
                        button.addEventListener('click', async (event) => {
                            const guildId = event.target.dataset.guildid;
                            const guildName = event.target.dataset.guildname;
                            await loadAutoModRules(guildId, guildName);
                        });
                    });
                } else {
                    guildsListDiv.innerHTML = '<p>You are not an administrator in any guilds.</p>';
                }
            } else {
                guildsListDiv.innerHTML = '<p>No guild information available.</p>';
            }
        } else if (response.status === 401) {
            userStatusDiv.innerHTML = '<p>You are not logged in.</p>';
            loginButton.style.display = 'block';
            guildsListDiv.innerHTML = ''; // Clear any previous guild list
            autoModSection.style.display = 'none'; // Hide automod section
        } else {
            throw new Error(`Failed to fetch user data: ${response.status}`);
        }
    } catch (error) {
        console.error('Error fetching user data:', error);
        userStatusDiv.innerHTML = `<p>Error loading user data. ${error.message}. Try <a href="/auth/discord">logging in</a>.</p>`;
        loginButton.style.display = 'block';
        guildsListDiv.innerHTML = '';
        autoModSection.style.display = 'none';
    }

    async function loadAutoModRules(guildId, guildName) {
        autoModGuildName.textContent = `AutoMod Rules for ${guildName}`;
        autoModRulesForm.innerHTML = '<p>Loading rules...</p>';
        autoModSection.style.display = 'block';
        saveAutoModButton.style.display = 'none'; // Hide initially

        try {
            const response = await fetch(`/api/guilds/${guildId}/automod/rules`);
            if (!response.ok) {
                throw new Error(`Failed to fetch automod rules: ${response.status}`);
            }
            const rules = await response.json(); // rules is an array like [{ rule_type: 'type', rule_value: 'value' }]

            // For simplicity, this example assumes a few known rule types.
            // A more dynamic form could be built if rule types are not fixed.
            const knownRuleTypes = ['banned_words', 'anti_spam', 'anti_mention', 'anti_link'];
            let formHtml = '';

            // Create a map of existing rules for easier lookup
            const currentRules = {};
            if (Array.isArray(rules)) {
                rules.forEach(rule => {
                    currentRules[rule.rule_type] = rule.rule_value;
                });
            }

            knownRuleTypes.forEach(type => {
                const value = currentRules[type] || '';
                formHtml += `
                    <div>
                        <label for="rule-${type}">${type.replace('_', ' ')}:</label>
                        <input type="text" id="rule-${type}" name="${type}" value="${value}" placeholder="Enter rule value (e.g., words, count, domains)">
                    </div>
                `;
            });

            autoModRulesForm.innerHTML = formHtml;
            saveAutoModButton.style.display = 'block';
            saveAutoModButton.dataset.guildid = guildId; // Store guildId for saving

        } catch (error) {
            console.error(`Error loading automod rules for guild ${guildId}:`, error);
            autoModRulesForm.innerHTML = `<p>Error loading rules: ${error.message}</p>`;
        }
    }

    saveAutoModButton.addEventListener('click', async () => {
        const guildId = saveAutoModButton.dataset.guildid;
        if (!guildId) {
            alert('Error: No Guild ID specified for saving rules.');
            return;
        }

        const rulesToSave = {};
        const inputs = autoModRulesForm.querySelectorAll('input[type="text"]');
        inputs.forEach(input => {
            if (input.value.trim() !== '') { // Only save rules that have a value
                rulesToSave[input.name] = input.value.trim();
            }
        });

        if (Object.keys(rulesToSave).length === 0) {
            alert('No rules to save. Please enter values for the rules you want to set.');
            // Or, you could send an empty object to clear all rules if that's desired.
            // For now, we require at least one rule to be set to save.
            return;
        }

        try {
            const response = await fetch(`/api/guilds/${guildId}/automod/rules`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(rulesToSave),
            });

            if (response.ok) {
                const result = await response.json();
                alert(`AutoMod rules saved successfully for guild ${guildId}! Message: ${result.message}`);
                // Optionally, reload rules or give other visual feedback
            } else {
                const errorResult = await response.json().catch(() => ({ error: 'Failed to save rules and parse error response.' }));
                throw new Error(errorResult.error || `Failed to save rules: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error saving automod rules for guild ${guildId}:`, error);
            alert(`Error saving rules: ${error.message}`);
        }
    });
});
