#!/usr/bin/env node

import chalk from 'chalk';
import boxen from 'boxen';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

/**
 * Help System
 * Система помощи и документации по командам
 */
class HelpSystem {
    constructor() {
        this.commands = {
            author: {
                title: '✍️  Команды для авторов',
                commands: {
                    'author:init': {
                        description: 'Инициализация профиля автора',
                        usage: 'npm run author:init',
                        details: 'Создает профиль автора для атрибуции контента на godojo.dev'
                    },
                    'author:new': {
                        description: 'Создание нового контента',
                        usage: 'npm run author:new',
                        details: 'Интерактивное создание новой темы или категории'
                    },
                    'author:validate': {
                        description: 'Проверка качества контента',
                        usage: 'npm run author:validate',
                        details: 'Проверяет соответствие стандартам качества (800+ слов, примеры, упражнения)'
                    },
                    'author:stats': {
                        description: 'Статистика автора',
                        usage: 'npm run author:stats',
                        details: 'Показывает количество созданного контента и историю'
                    },
                    'author:preview': {
                        description: 'Предпросмотр контента',
                        usage: 'npm run author:preview [file]',
                        details: 'Локальный предпросмотр как будет выглядеть на сайте'
                    },
                    'author:publish': {
                        description: 'Подготовка к публикации',
                        usage: 'npm run author:publish',
                        details: 'Финальная проверка и подготовка PR'
                    }
                }
            },
            content: {
                title: '📝 Работа с контентом',
                commands: {
                    'content:check': {
                        description: 'Проверка всего контента',
                        usage: 'npm run content:check',
                        details: 'Проверяет качество, структуру, ссылки во всем контенте'
                    },
                    'content:format': {
                        description: 'Форматирование markdown',
                        usage: 'npm run content:format',
                        details: 'Автоматическое форматирование всех markdown файлов'
                    },
                    'content:build': {
                        description: 'Сборка для godojo.dev',
                        usage: 'npm run content:build',
                        details: 'Генерирует JSON/YAML файлы для платформы'
                    },
                    'content:sync': {
                        description: 'Синхронизация с Git',
                        usage: 'npm run content:sync',
                        details: 'Помощь с git операциями для контента'
                    }
                }
            },
            structure: {
                title: '🏗️  Структура проекта',
                commands: {
                    'structure:validate': {
                        description: 'Проверка структуры',
                        usage: 'npm run structure:validate',
                        details: 'Проверяет правильность структуры директорий и файлов'
                    },
                    'structure:generate': {
                        description: 'Генерация структуры',
                        usage: 'npm run structure:generate',
                        details: 'Создает недостающие директории и файлы'
                    }
                }
            },
            bilingual: {
                title: '🌍 Двуязычность',
                commands: {
                    'bilingual:sync': {
                        description: 'Синхронизация языков',
                        usage: 'npm run bilingual:sync',
                        details: 'Отслеживание изменений между ru/en версиями'
                    },
                    'bilingual:check': {
                        description: 'Проверка переводов',
                        usage: 'npm run bilingual:check',
                        details: 'Поиск непереведенного контента'
                    }
                }
            },
            godojo: {
                title: '🚀 Интеграция с godojo.dev',
                commands: {
                    'godojo:prepare': {
                        description: 'Подготовка для платформы',
                        usage: 'npm run godojo:prepare',
                        details: 'Оптимизация и подготовка контента для загрузки'
                    },
                    'godojo:validate': {
                        description: 'Валидация для платформы',
                        usage: 'npm run godojo:validate',
                        details: 'Проверка совместимости с требованиями godojo.dev'
                    }
                }
            },
            dev: {
                title: '🛠️  Разработка',
                commands: {
                    'lint': {
                        description: 'Проверка кода',
                        usage: 'npm run lint',
                        details: 'ESLint проверка JavaScript и Markdown'
                    },
                    'lint:fix': {
                        description: 'Исправление стиля кода',
                        usage: 'npm run lint:fix',
                        details: 'Автоматическое исправление проблем линтера'
                    },
                    'format': {
                        description: 'Форматирование кода',
                        usage: 'npm run format',
                        details: 'Prettier форматирование всех файлов'
                    },
                    'test': {
                        description: 'Запуск тестов',
                        usage: 'npm test',
                        details: 'Запуск всех unit тестов'
                    },
                    'test:watch': {
                        description: 'Тесты в режиме watch',
                        usage: 'npm run test:watch',
                        details: 'Автоматический перезапуск тестов при изменениях'
                    },
                    'test:coverage': {
                        description: 'Покрытие кода тестами',
                        usage: 'npm run test:coverage',
                        details: 'Генерация отчета о покрытии'
                    }
                }
            }
        };
    }

    /**
     * Запуск справки
     */
    async run(args = []) {
        const command = args[0];

        if (command) {
            // Показываем справку по конкретной команде
            await this.showCommandHelp(command);
        } else {
            // Показываем общую справку
            await this.showGeneralHelp();
        }
    }

    /**
     * Общая справка
     */
    async showGeneralHelp() {
        // Заголовок
        console.log(boxen(
            chalk.blue.bold('📚 Go Tutorial Content - Система помощи\n\n') +
            chalk.white('Образовательный контент для godojo.dev\n') +
            chalk.gray('Используйте команды ниже для работы с проектом'),
            {
                padding: 1,
                borderColor: 'blue',
                borderStyle: 'round',
                margin: 1
            }
        ));

        // Показываем все категории команд
        for (const [category, data] of Object.entries(this.commands)) {
            console.log(chalk.blue.bold(`\n${data.title}\n`));

            for (const [cmd, info] of Object.entries(data.commands)) {
                console.log(
                    chalk.yellow(`  npm run ${cmd}`).padEnd(35) +
                    chalk.gray(info.description)
                );
            }
        }

        // Дополнительная информация
        console.log(chalk.blue.bold('\n📖 Дополнительная помощь\n'));
        console.log(chalk.gray('  • Для помощи по команде:'), chalk.cyan('npm run help <command>'));
        console.log(chalk.gray('  • Руководство автора:'), chalk.cyan('CONTRIBUTING.md'));
        console.log(chalk.gray('  • Документация проекта:'), chalk.cyan('README.md'));
        console.log(chalk.gray('  • Создать issue:'), chalk.cyan('https://github.com/[owner]/golang-book-ru/issues'));

        // Быстрый старт
        console.log(chalk.blue.bold('\n🚀 Быстрый старт для новых авторов\n'));
        console.log(chalk.gray('  1.'), chalk.yellow('npm install'), '- установка зависимостей');
        console.log(chalk.gray('  2.'), chalk.yellow('npm run author:init'), '- создание профиля автора');
        console.log(chalk.gray('  3.'), chalk.yellow('npm run author:new'), '- создание первого контента');
        console.log(chalk.gray('  4.'), chalk.yellow('npm run author:validate'), '- проверка качества');
        console.log(chalk.gray('  5.'), chalk.yellow('npm run content:sync'), '- создание коммита\n');

        // Версия и информация
        await this.showVersionInfo();
    }

    /**
     * Справка по конкретной команде
     */
    async showCommandHelp(commandName) {
        // Убираем префикс npm run если есть
        const cmd = commandName.replace('npm run ', '').trim();

        // Ищем команду
        let found = false;
        for (const [category, data] of Object.entries(this.commands)) {
            if (data.commands[cmd]) {
                const cmdInfo = data.commands[cmd];

                console.log(boxen(
                    chalk.blue.bold(`📌 ${cmd}\n\n`) +
                    chalk.white(`${cmdInfo.description}\n\n`) +
                    chalk.gray(cmdInfo.details),
                    {
                        padding: 1,
                        borderColor: 'blue',
                        borderStyle: 'round',
                        title: data.title,
                        titleAlignment: 'center'
                    }
                ));

                console.log(chalk.blue('\n📋 Использование:\n'));
                console.log(chalk.yellow(`  ${cmdInfo.usage}\n`));

                // Показываем примеры если есть
                this.showExamples(cmd);

                // Связанные команды
                this.showRelatedCommands(cmd, category);

                found = true;
                break;
            }
        }

        if (!found) {
            console.log(chalk.red(`\n❌ Команда '${cmd}' не найдена\n`));
            console.log(chalk.gray('Используйте'), chalk.cyan('npm run help'), chalk.gray('для списка всех команд\n'));
        }
    }

    /**
     * Показ примеров использования
     */
    showExamples(command) {
        const examples = {
            'author:new': [
                {
                    title: 'Создание новой темы',
                    description: 'Выберите категорию → Тема урока → Заполните метаданные',
                    output: 'Создаст: content/basics/01-introduction/topic.md'
                }
            ],
            'content:check': [
                {
                    title: 'Проверка всего контента',
                    description: 'Проверит все .md файлы на качество и ошибки',
                    output: 'Покажет список проблем и предупреждений'
                }
            ],
            'git:sync': [
                {
                    title: 'Создание коммита',
                    description: 'Выберите файлы → Введите сообщение → Создайте коммит',
                    output: 'git add content/ && git commit -m "content: ...\"'
                }
            ]
        };

        if (examples[command]) {
            console.log(chalk.blue('💡 Примеры:\n'));
            examples[command].forEach(example => {
                console.log(chalk.green(`  ${example.title}`));
                console.log(chalk.gray(`  ${example.description}`));
                if (example.output) {
                    console.log(chalk.gray(`  → ${example.output}\n`));
                }
            });
        }
    }

    /**
     * Показ связанных команд
     */
    showRelatedCommands(command, category) {
        const related = {
            'author:new': ['author:validate', 'content:format'],
            'author:validate': ['content:check', 'author:publish'],
            'content:check': ['content:format', 'author:validate'],
            'content:build': ['godojo:validate', 'godojo:prepare']
        };

        if (related[command]) {
            console.log(chalk.blue('🔗 См. также:\n'));
            related[command].forEach(rel => {
                const relCmd = this.findCommand(rel);
                if (relCmd) {
                    console.log(chalk.yellow(`  npm run ${rel}`).padEnd(30) + chalk.gray(`- ${relCmd.description}`));
                }
            });
            console.log('');
        }
    }

    /**
     * Поиск команды в структуре
     */
    findCommand(cmdName) {
        for (const data of Object.values(this.commands)) {
            if (data.commands[cmdName]) {
                return data.commands[cmdName];
            }
        }
        return null;
    }

    /**
     * Показ версии и информации о проекте
     */
    async showVersionInfo() {
        try {
            if (existsSync('package.json')) {
                const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

                console.log(chalk.gray('─'.repeat(50)));
                console.log(chalk.gray(`Версия: ${packageJson.version || 'dev'}`));
                console.log(chalk.gray(`Node.js: ${process.version}`));
                console.log(chalk.gray(`Платформа: ${process.platform}`));
            }
        } catch (error) {
            // Игнорируем ошибки
        }
    }

    /**
     * Поиск команд (для автодополнения в будущем)
     */
    searchCommands(query) {
        const results = [];
        const searchTerm = query.toLowerCase();

        for (const [category, data] of Object.entries(this.commands)) {
            for (const [cmd, info] of Object.entries(data.commands)) {
                if (cmd.includes(searchTerm) || info.description.toLowerCase().includes(searchTerm)) {
                    results.push({
                        command: cmd,
                        description: info.description,
                        category: data.title
                    });
                }
            }
        }

        return results;
    }
}

// Запуск
const help = new HelpSystem();
const args = process.argv.slice(2);
help.run(args);