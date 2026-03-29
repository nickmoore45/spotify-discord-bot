const { EmbedBuilder } = require('discord.js');

module.exports = {
  async execute(interaction, client) {
    const { spotifyManager } = client;

    await interaction.deferReply({ flags: 64 });

    const authUrl = spotifyManager.getAuthUrl(interaction.user.id);

    const embed = new EmbedBuilder()
      .setTitle('🎵 Connect Spotify to Greg')
      .setDescription(
        '**Step 1:** Click the link below and authorize Spotify\n\n' +
        '**Step 2:** After authorizing, your browser will show an error page or blank page — that\'s normal!\n\n' +
        '**Step 3:** Copy the **entire URL** from your browser\'s address bar and paste it here in Discord\n\n' +
        `[👉 Click here to authorize Spotify](${authUrl})`
      )
      .setColor(0x1DB954);

    await interaction.editReply({ embeds: [embed] });

    // Wait for them to paste the callback URL in this channel
    const filter = m =>
      m.author.id === interaction.user.id &&
      m.content.includes('code=');

    const collector = interaction.channel.createMessageCollector({
      filter,
      time: 5 * 60 * 1000, // 5 minute window
      max: 1,
    });

    collector.on('collect', async (message) => {
      try {
        // Extract the code from the pasted URL
        const url = new URL(message.content.trim());
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');

        if (!code) {
          await message.reply('❌ Couldn\'t find the auth code in that URL. Make sure you copied the full URL from your browser.');
          return;
        }

        // Exchange code for tokens
        await spotifyManager.handleCallbackCode(code, state, interaction.user.id);

        await message.reply({
          content: '✅ Spotify connected successfully! Now join a voice channel and use `/join`.',
        });

        // Clean up the pasted URL message for privacy
        try { await message.delete(); } catch {}

      } catch (err) {
        console.error('Connect error:', err);
        await message.reply('❌ Something went wrong. Try `/connect` again.');
      }
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        interaction.followUp({
          content: '⏰ Connection timed out. Run `/connect` again when ready.',
          flags: 64,
        }).catch(() => {});
      }
    });
  },
};
