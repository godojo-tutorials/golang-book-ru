#!/usr/bin/env node

import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import matter from 'gray-matter';

/**
 * Structure Validator
 * Проверяет правильность структуры проекта
 */
class StructureValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.expectedStructure = {
            root: [
                'content',
                'content.config.json',
                'package.json',
                'CONTRIBUTING.md',
                'README.md',
                'scripts'
            ],
            scripts: [
                'content-author.js',
                'content-checker.js',
                'content-formatter.js',
                'content-builder.js',
                'git-sync.js',
                'structure-validator.js',
                'structure-generator.js',
                'help.js'
            ]
        };
    }

    /**
     * Запуск валидации
     */
    async run() {
        console.log(chalk.blue.bold('\n🔍 Валидация структуры проекта\n'));

        const spinner = ora('Проверка структуры...').start();

        try {
            // Проверяем корневую структуру
            spinner.text = 'Проверка корневых файлов и директорий...';
            await this.validateRootStructure();

            // Проверяем структуру content
            spinner.text = 'Проверка структуры контента...';
            await this.validateContentStructure();

            // Проверяем конфигурацию
            spinner.text = 'Проверка конфигурации...';
            await this.validateConfiguration();

            // Проверяем соглашения о наименовании
            spinner.text = 'Проверка соглашений о наименовании...';
            await this.validateNamingConventions();

            // Проверяем целостность ссылок
            spinner.text = 'Проверка целостности структуры...';
            await this.validateIntegrity();

            spinner.stop();

            // Выводим результаты
            this.printResults();

            // Код выхода
            process.exit(this.errors.length > 0 ? 1 : 0);

        } catch (error) {
            spinner.fail(`Ошибка: ${error.message}`);
            process.exit(1);
        }
    }

    /**
     * Проверка корневой структуры
     */
    async validateRootStructure() {
        // Проверяем обязательные файлы и директории
        for (const item of this.expectedStructure.root) {
            if (!existsSync(item)) {
                this.addError(`Отсутствует обязательный элемент: ${item}`);
            }
        }

        // Проверяем scripts
        if (existsSync('scripts')) {
            for (const script of this.expectedStructure.scripts) {
                const scriptPath = join('scripts', script);
                if (!existsSync(scriptPath)) {
                    this.addWarning(`Отсутствует скрипт: ${script}`);
                }
            }
        }
    }

    /**
     * Проверка структуры content
     */
    async validateContentStructure() {
        const contentDir = 'content';

        if (!existsSync(contentDir)) {
            this.addError('Директория content не найдена');
            return;
        }

        // Получаем конфигурацию для проверки категорий
        const config = await this.loadConfig();
        if (!config) return;

        // Проверяем каждую категорию из конфига
        for (const category of config.categories) {
            const categoryPath = join(contentDir, category.slug);

            // Проверяем существование директории категории
            if (!existsSync(categoryPath)) {
                this.addError(`Отсутствует директория категории: ${category.slug}`);
                continue;
            }

            // Проверяем index.md
            const indexPath = join(categoryPath, 'index.md');
            if (!existsSync(indexPath)) {
                this.addError(`Отсутствует index.md в категории: ${category.slug}`);
            } else {
                // Проверяем содержимое index.md
                await this.validateCategoryIndex(indexPath, category);
            }

            // Проверяем структуру тем
            await this.validateTopicsStructure(categoryPath);
        }
    }

    /**
     * Загрузка конфигурации
     */
    async loadConfig() {
        try {
            const configContent = await readFile('content.config.json', 'utf8');
            return JSON.parse(configContent);
        } catch (error) {
            this.addError(`Ошибка чтения конфигурации: ${error.message}`);
            return null;
        }
    }

    /**
     * Проверка index.md категории
     */
    async validateCategoryIndex(indexPath, categoryConfig) {
        try {
            const content = await readFile(indexPath, 'utf8');
            const { data: frontmatter } = matter(content);

            // Проверяем соответствие конфигурации
            if (frontmatter.category !== categoryConfig.slug) {
                this.addError(`Несоответствие slug категории в ${indexPath}`);
            }

            // Проверяем обязательные поля
            const requiredFields = ['title', 'description', 'difficulty', 'authorId'];
            for (const field of requiredFields) {
                if (!frontmatter[field]) {
                    this.addError(`Отсутствует поле '${field}' в ${indexPath}`);
                }
            }

        } catch (error) {
            this.addError(`Ошибка чтения ${indexPath}: ${error.message}`);
        }
    }

    /**
     * Проверка структуры тем
     */
    async validateTopicsStructure(categoryPath) {
        const entries = await readdir(categoryPath, { withFileTypes: true });
        const topicDirs = entries.filter(e => e.isDirectory());

        if (topicDirs.length === 0) {
            this.addWarning(`Нет тем в категории: ${relative(process.cwd(), categoryPath)}`);
        }

        for (const dir of topicDirs) {
            const topicPath = join(categoryPath, dir.name);

            // Проверяем соглашение о наименовании (должно начинаться с номера)
            if (!/^\d{2}-/.test(dir.name)) {
                this.addWarning(`Неправильное имя директории темы: ${dir.name} (должно начинаться с 01-, 02-, и т.д.)`);
            }

            // Проверяем наличие topic.md
            const topicFile = join(topicPath, 'topic.md');
            if (!existsSync(topicFile)) {
                this.addError(`Отсутствует topic.md в: ${relative(process.cwd(), topicPath)}`);
            } else {
                await this.validateTopicFile(topicFile);
            }
        }
    }

    /**
     * Проверка файла темы
     */
    async validateTopicFile(topicPath) {
        try {
            const content = await readFile(topicPath, 'utf8');
            const { data: frontmatter } = matter(content);

            // Проверяем обязательные поля
            const requiredFields = [
                'title', 'description', 'module', 'category',
                'slug', 'difficulty', 'authorId'
            ];

            for (const field of requiredFields) {
                if (!frontmatter[field]) {
                    this.addError(`Отсутствует поле '${field}' в ${relative(process.cwd(), topicPath)}`);
                }
            }

            // Проверяем числовые поля
            if (frontmatter.module && (frontmatter.module < 1 || frontmatter.module > 79)) {
                this.addWarning(`Неверный номер модуля (${frontmatter.module}) в ${relative(process.cwd(), topicPath)}`);
            }

        } catch (error) {
            this.addError(`Ошибка чтения ${relative(process.cwd(), topicPath)}: ${error.message}`);
        }
    }

    /**
     * Проверка конфигурации
     */
    async validateConfiguration() {
        const configPath = 'content.config.json';

        if (!existsSync(configPath)) {
            this.addError('Файл content.config.json не найден');
            return;
        }

        try {
            const content = await readFile(configPath, 'utf8');
            const config = JSON.parse(content);

            // Проверяем обязательные секции
            const requiredSections = ['structure', 'categories', 'quality', 'godojo'];
            for (const section of requiredSections) {
                if (!config[section]) {
                    this.addError(`Отсутствует секция '${section}' в конфигурации`);
                }
            }

            // Проверяем категории
            if (config.categories && Array.isArray(config.categories)) {
                const slugs = new Set();

                for (const category of config.categories) {
                    // Проверяем уникальность slug
                    if (slugs.has(category.slug)) {
                        this.addError(`Дублирующийся slug категории: ${category.slug}`);
                    }
                    slugs.add(category.slug);

                    // Проверяем обязательные поля категории
                    const requiredFields = ['slug', 'titleRu', 'modules', 'difficulty'];
                    for (const field of requiredFields) {
                        if (!category[field]) {
                            this.addError(`Отсутствует поле '${field}' в категории ${category.slug || 'unknown'}`);
                        }
                    }
                }
            }

        } catch (error) {
            this.addError(`Ошибка парсинга конфигурации: ${error.message}`);
        }
    }

    /**
     * Проверка соглашений о наименовании
     */
    async validateNamingConventions() {
        const contentDir = 'content';

        if (!existsSync(contentDir)) return;

        // Рекурсивно проверяем все файлы
        await this.checkNaming(contentDir);
    }

    /**
     * Рекурсивная проверка наименований
     */
    async checkNaming(dir) {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                // Проверяем имя директории (только lowercase, цифры и дефис)
                if (!/^[a-z0-9-]+$/.test(entry.name)) {
                    this.addWarning(`Неправильное имя директории: ${relative(process.cwd(), fullPath)}`);
                }

                // Рекурсивная проверка
                await this.checkNaming(fullPath);

            } else if (entry.isFile()) {
                // Проверяем имя файла
                if (entry.name.endsWith('.md')) {
                    if (!/^[a-z0-9-]+\.md$/.test(entry.name)) {
                        this.addWarning(`Неправильное имя файла: ${relative(process.cwd(), fullPath)}`);
                    }
                }
            }
        }
    }

    /**
     * Проверка целостности структуры
     */
    async validateIntegrity() {
        // Проверяем, что все темы имеют последовательную нумерацию
        const contentDir = 'content';

        if (!existsSync(contentDir)) return;

        const categories = await readdir(contentDir, { withFileTypes: true });

        for (const category of categories) {
            if (!category.isDirectory()) continue;

            const categoryPath = join(contentDir, category.name);
            const topics = await readdir(categoryPath, { withFileTypes: true });

            const topicNumbers = [];

            for (const topic of topics) {
                if (!topic.isDirectory()) continue;

                const match = topic.name.match(/^(\d{2})-/);
                if (match) {
                    topicNumbers.push(parseInt(match[1]));
                }
            }

            // Проверяем последовательность
            topicNumbers.sort((a, b) => a - b);

            for (let i = 0; i < topicNumbers.length; i++) {
                const expected = i + 1;
                if (topicNumbers[i] !== expected) {
                    this.addWarning(`Нарушена последовательность нумерации тем в ${category.name}: ожидался ${expected}, найден ${topicNumbers[i]}`);
                    break;
                }
            }
        }
    }

    /**
     * Добавление ошибки
     */
    addError(message) {
        this.errors.push(message);
    }

    /**
     * Добавление предупреждения
     */
    addWarning(message) {
        this.warnings.push(message);
    }

    /**
     * Вывод результатов
     */
    printResults() {
        console.log(chalk.blue('\n📊 Результаты валидации структуры:\n'));

        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log(chalk.green('✅ Структура проекта корректна!\n'));
            return;
        }

        // Выводим ошибки
        if (this.errors.length > 0) {
            console.log(chalk.red.bold(`❌ Найдено ошибок: ${this.errors.length}\n`));
            this.errors.forEach((error, i) => {
                console.log(chalk.red(`${i + 1}. ${error}`));
            });
        }

        // Выводим предупреждения
        if (this.warnings.length > 0) {
            console.log(chalk.yellow.bold(`\n⚠️  Предупреждений: ${this.warnings.length}\n`));
            this.warnings.forEach((warning, i) => {
                console.log(chalk.yellow(`${i + 1}. ${warning}`));
            });
        }

        // Рекомендации
        if (this.errors.length > 0) {
            console.log(chalk.blue('\n💡 Рекомендации:'));
            console.log(chalk.gray('  • Используйте'), chalk.cyan('npm run structure:generate'), chalk.gray('для создания недостающих элементов'));
            console.log(chalk.gray('  • Проверьте CONTRIBUTING.md для понимания структуры'));
            console.log(chalk.gray('  • Убедитесь, что content.config.json актуален\n'));
        }
    }
}

// Запуск
const validator = new StructureValidator();
validator.run();