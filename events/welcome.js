const { Events, EmbedBuilder } = require('discord.js');

module.exports = {
  name: Events.GuildMemberAdd,
  once: false,
  execute(member) {
    // Cambiá este ID por el canal de bienvenida que vos quieras
    const canalBienvenidaId = '1177423543831629864';
    const canalBienvenida = member.guild.channels.cache.get(canalBienvenidaId);

    if (!canalBienvenida) return;

    const embed = new EmbedBuilder()
      .setColor(0x00BFFF)
      .setTitle('🎉 ¡Nuevo miembro se ha unido!')
      .setDescription(`Bienvenido/a al servidor, ${member}! 🥳\nLeé las <#912889677806178345> y pasala genial.`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setImage('https://static.wikia.nocookie.net/esgta/images/8/8b/Calamardo_guapo_8_bits.gif') // Podés cambiar esta imagen
      .setFooter({ text: `Usuario ID: ${member.id}` })
      .setTimestamp();

    canalBienvenida.send({ embeds: [embed] });
  }
};

