import { Events, EmbedBuilder } from 'discord.js';

export const name = Events.GuildMemberAdd;
export const once = false;

export async function execute(member) {
    // Canal de bienvenida
    const canalBienvenidaId = '1177423543831629864';
    const canalBienvenida = member.guild.channels.cache.get(canalBienvenidaId);

    if (!canalBienvenida) {
        console.error('Canal de bienvenida no encontrado');
        return;
    }

    try {
        const embed = new EmbedBuilder()
            .setColor(0x00BFFF)
            .setTitle('🎉 ¡Nuevo miembro se ha unido!')
            .setDescription(`Bienvenido/a al servidor, ${member}! 🥳\nLeé las <#912889677806178345> y pasala genial.`)
            .setThumbnail(member.user.displayAvatarURL())
            .setImage('https://static.wikia.nocookie.net/esgta/images/8/8b/Calamardo_guapo_8_bits.gif')
            .setFooter({ text: `Usuario ID: ${member.id}` })
            .setTimestamp();

        await canalBienvenida.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error al enviar mensaje de bienvenida:', error);
    }
}

