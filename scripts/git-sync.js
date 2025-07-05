#!/usr/bin/env node

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

const execAsync = promisify(exec);

/**
 * Git Sync Tool
 * Автоматизация git операций для контента
 */
class GitSync {
    constructor() {
        this.hasChanges = false;
        this.currentBranch = '';
        this.stats = {
            added: 0,
            modified: 0,
            deleted: 0
        };
    }

    /**
     * Запуск синхронизации
     */
    async run() {
        console.log(chalk.blue.bold('\n🔄 Синхронизация с Git\n'));

        const spinner = ora('Проверка состояния репозитория...').start();

        try {
            // Проверяем, что мы в git репозитории
            await this.checkGitRepo();

            // Получаем текущую ветку
            spinner.text = 'Определение текущей ветки...';
            this.currentBranch = await this.getCurrentBranch();

            // Проверяем изменения
            spinner.text = 'Проверка изменений...';
            await this.checkChanges();

            if (!this.hasChanges) {
                spinner.succeed('Нет изменений для синхронизации');
                console.log(chalk.gray('\n✨ Рабочая директория чистая\n'));
                return;
            }

            spinner.succeed(`Найдены изменения: ${this.getTotalChanges()} файлов`);

            // Показываем изменения
            await this.showChanges();

            // Спрашиваем пользователя о действиях
            const action = await this.promptAction();

            // Выполняем выбранное действие
            await this.executeAction(action);

        } catch (error) {
            spinner.fail(`Ошибка: ${error.message}`);
            process.exit(1);
        }
    }

    /**
     * Проверка git репозитория
     */
    async checkGitRepo() {
        try {
            await execAsync('git rev-parse --is-inside-work-tree');
        } catch {
            throw new Error('Не найден git репозиторий. Инициализируйте его командой: git init');
        }
    }

    /**
     * Получение текущей ветки
     */
    async getCurrentBranch() {
        const { stdout } = await execAsync('git branch --show-current');
        return stdout.trim();
    }

    /**
     * Проверка изменений
     */
    async checkChanges() {
        const { stdout } = await execAsync('git status --porcelain');

        if (stdout.trim() === '') {
            this.hasChanges = false;
            return;
        }

        this.hasChanges = true;

        // Парсим изменения
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
            const status = line.substring(0, 2);

            if (status.includes('A') || status.includes('?')) {
                this.stats.added++;
            } else if (status.includes('M')) {
                this.stats.modified++;
            } else if (status.includes('D')) {
                this.stats.deleted++;
            }
        }
    }

    /**
     * Подсчет общего количества изменений
     */
    getTotalChanges() {
        return this.stats.added + this.stats.modified + this.stats.deleted;
    }

    /**
     * Показ изменений
     */
    async showChanges() {
        console.log(chalk.blue('\n📊 Изменения:\n'));

        if (this.stats.added > 0) {
            console.log(chalk.green(`  ➕ Добавлено: ${this.stats.added}`));
        }
        if (this.stats.modified > 0) {
            console.log(chalk.yellow(`  ✏️  Изменено: ${this.stats.modified}`));
        }
        if (this.stats.deleted > 0) {
            console.log(chalk.red(`  ➖ Удалено: ${this.stats.deleted}`));
        }

        // Показываем детали
        const { stdout } = await execAsync('git status -s');
        console.log(chalk.gray('\nДетали изменений:'));
        console.log(chalk.gray(stdout));
    }

    /**
     * Запрос действия у пользователя
     */
    async promptAction() {
        const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: 'Что вы хотите сделать?',
            choices: [
                {
                    name: '📝 Создать коммит с изменениями',
                    value: 'commit'
                },
                {
                    name: '🌿 Создать новую ветку и коммит',
                    value: 'branch-commit'
                },
                {
                    name: '🔄 Синхронизировать с удаленным репозиторием',
                    value: 'sync'
                },
                {
                    name: '📊 Показать подробный статус',
                    value: 'status'
                },
                {
                    name: '❌ Отменить',
                    value: 'cancel'
                }
            ]
        }]);

        return action;
    }

    /**
     * Выполнение действия
     */
    async executeAction(action) {
        switch (action) {
            case 'commit':
                await this.createCommit();
                break;

            case 'branch-commit':
                await this.createBranchAndCommit();
                break;

            case 'sync':
                await this.syncWithRemote();
                break;

            case 'status':
                await this.showDetailedStatus();
                break;

            case 'cancel':
                console.log(chalk.gray('\n❌ Операция отменена\n'));
                break;
        }
    }

    /**
     * Создание коммита
     */
    async createCommit() {
        // Выбираем файлы для добавления
        const { filesToAdd } = await inquirer.prompt([{
            type: 'checkbox',
            name: 'filesToAdd',
            message: 'Выберите файлы для коммита:',
            choices: [
                {
                    name: 'Все файлы контента (content/**)',
                    value: 'content',
                    checked: true
                },
                {
                    name: 'Конфигурационные файлы',
                    value: 'config',
                    checked: false
                },
                {
                    name: 'Все изменения',
                    value: 'all',
                    checked: false
                }
            ]
        }]);

        // Генерируем сообщение коммита
        const commitMessage = await this.generateCommitMessage();

        const spinner = ora('Создание коммита...').start();

        try {
            // Добавляем файлы
            for (const type of filesToAdd) {
                switch (type) {
                    case 'content':
                        await execAsync('git add content/');
                        break;
                    case 'config':
                        await execAsync('git add *.json *.yaml *.yml');
                        break;
                    case 'all':
                        await execAsync('git add .');
                        break;
                }
            }

            // Создаем коммит
            await execAsync(`git commit -m "${commitMessage}"`);

            spinner.succeed('Коммит создан успешно!');

            // Показываем информацию о коммите
            const { stdout } = await execAsync('git log -1 --oneline');
            console.log(chalk.gray('\nСоздан коммит:'), chalk.green(stdout.trim()));

        } catch (error) {
            spinner.fail('Не удалось создать коммит');
            console.error(chalk.red(error.message));
        }
    }

    /**
     * Создание ветки и коммита
     */
    async createBranchAndCommit() {
        const { branchName } = await inquirer.prompt([{
            type: 'input',
            name: 'branchName',
            message: 'Название новой ветки:',
            validate: input => {
                if (!input.trim()) return 'Название ветки не может быть пустым';
                if (!/^[a-zA-Z0-9-_/]+$/.test(input)) {
                    return 'Используйте только буквы, цифры, дефис и подчеркивание';
                }
                return true;
            },
            filter: input => `content/${input.trim()}`
        }]);

        const spinner = ora('Создание ветки...').start();

        try {
            // Создаем и переключаемся на новую ветку
            await execAsync(`git checkout -b ${branchName}`);
            spinner.text = 'Ветка создана, создание коммита...';

            // Создаем коммит
            await this.createCommit();

            spinner.succeed(`Ветка ${branchName} создана с коммитом`);

        } catch (error) {
            spinner.fail('Не удалось создать ветку');
            console.error(chalk.red(error.message));
        }
    }

    /**
     * Синхронизация с удаленным репозиторием
     */
    async syncWithRemote() {
        const spinner = ora('Проверка удаленного репозитория...').start();

        try {
            // Проверяем наличие remote
            const { stdout: remotes } = await execAsync('git remote');

            if (!remotes.trim()) {
                spinner.fail('Удаленный репозиторий не настроен');
                console.log(chalk.yellow('\n💡 Добавьте удаленный репозиторий:'));
                console.log(chalk.gray('   git remote add origin <URL>\n'));
                return;
            }

            // Получаем изменения
            spinner.text = 'Получение изменений...';
            await execAsync('git fetch');

            // Проверяем статус
            const { stdout: status } = await execAsync('git status -sb');

            if (status.includes('ahead')) {
                spinner.text = 'Отправка изменений...';
                await execAsync(`git push origin ${this.currentBranch}`);
                spinner.succeed('Изменения отправлены!');
            } else if (status.includes('behind')) {
                spinner.text = 'Получение изменений...';
                await execAsync(`git pull origin ${this.currentBranch}`);
                spinner.succeed('Изменения получены!');
            } else {
                spinner.succeed('Репозиторий синхронизирован');
            }

        } catch (error) {
            spinner.fail('Ошибка синхронизации');
            console.error(chalk.red(error.message));
        }
    }

    /**
     * Показ детального статуса
     */
    async showDetailedStatus() {
        console.log(chalk.blue('\n📊 Детальный статус репозитория:\n'));

        try {
            // Текущая ветка
            console.log(chalk.gray('Текущая ветка:'), chalk.cyan(this.currentBranch));

            // Последний коммит
            const { stdout: lastCommit } = await execAsync('git log -1 --oneline');
            console.log(chalk.gray('Последний коммит:'), lastCommit.trim());

            // Статус
            const { stdout: status } = await execAsync('git status');
            console.log(chalk.gray('\nПолный статус:'));
            console.log(status);

        } catch (error) {
            console.error(chalk.red('Ошибка получения статуса:', error.message));
        }
    }

    /**
     * Генерация сообщения коммита
     */
    async generateCommitMessage() {
        // Анализируем изменения для умного сообщения
        const { stdout } = await execAsync('git diff --cached --name-only');
        const files = stdout.trim().split('\n').filter(f => f);

        let suggestion = 'content: Обновление контента';

        // Определяем тип изменений
        if (files.every(f => f.startsWith('content/'))) {
            const categories = new Set();
            files.forEach(f => {
                const match = f.match(/content\/([^/]+)/);
                if (match) categories.add(match[1]);
            });

            if (categories.size === 1) {
                suggestion = `content: Обновление категории ${Array.from(categories)[0]}`;
            } else if (categories.size > 1) {
                suggestion = `content: Обновление нескольких категорий`;
            }
        }

        const { commitMessage } = await inquirer.prompt([{
            type: 'input',
            name: 'commitMessage',
            message: 'Сообщение коммита:',
            default: suggestion,
            validate: input => input.trim().length > 0 || 'Сообщение не может быть пустым'
        }]);

        return commitMessage;
    }
}

// Запуск
const sync = new GitSync();
sync.run();