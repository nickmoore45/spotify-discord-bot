const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('connect')
    .setDescription('Link your Spotify account to Greg'),

  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Greg joins your current voice channel and becomes a Spotify device'),

  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Greg leaves the voice channel'),
];

async function registerCommands(client) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('📋 Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commandDefinitions.map(cmd => cmd.toJSON()) }
    );
    console.log('✅ Slash commands registered: /connect, /join, /leave\n');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
}

module.exports = { registerCommands };
