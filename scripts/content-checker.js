#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import { marked } from 'marked';
import matter from 'gray-matter';

/**
 * Content Quality Checker
 * Проверяет качество markdown контента по различным критериям
 */
class ContentChecker {
    constructor() {
        this.issues = [];
        this.warnings = [];
        this.stats = {
            totalFiles: 0,
            checkedFiles: 0,
            issues: 0,
            warnings: 0
        };
    }

    /**
     * Запуск проверки
     */
    async run() {
        console.log(chalk.blue.bold('\n📋 Проверка качества контента\n'));

        const spinner = ora('Сканирование файлов...').start();

        try {
            // Проверяем наличие директории content
            if (!existsSync('content')) {
                spinner.fail('Директория content не найдена');
                return;
            }

            // Сканируем все markdown файлы
            const files = await this.findMarkdownFiles('content');
            this.stats.totalFiles = files.length;

            spinner.text = `Найдено ${files.length} файлов для проверки`;

            // Проверяем каждый файл
            for (const file of files) {
                await this.checkFile(file);
                this.stats.checkedFiles++;
                spinner.text = `Проверено ${this.stats.checkedFiles}/${this.stats.totalFiles} файлов`;
            }

            spinner.succeed('Проверка завершена!');

            // Выводим результаты
            this.printResults();

            // Возвращаем код ошибки если есть критические проблемы
            process.exit(this.issues.length > 0 ? 1 : 0);

        } catch (error) {
            spinner.fail(`Ошибка: ${error.message}`);
            process.exit(1);
        }
    }

    /**
     * Поиск всех markdown файлов
     */
    async findMarkdownFiles(dir) {
        const files = [];
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                const subFiles = await this.findMarkdownFiles(fullPath);
                files.push(...subFiles);
            } else if (entry.name.endsWith('.md')) {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Проверка отдельного файла
     */
    async checkFile(filePath) {
        try {
            const content = await readFile(filePath, 'utf8');
            const { data: frontmatter, content: markdown } = matter(content);
            const relativePath = relative(process.cwd(), filePath);

            // Проверка frontmatter
            this.checkFrontmatter(frontmatter, relativePath);

            // Проверка содержимого
            this.checkContent(markdown, relativePath);

            // Проверка структуры
            this.checkStructure(markdown, relativePath);

            // Проверка примеров кода
            this.checkCodeExamples(markdown, relativePath);

            // Проверка ссылок
            await this.checkLinks(markdown, relativePath);

        } catch (error) {
            this.addIssue(filePath, `Не удалось прочитать файл: ${error.message}`);
        }
    }

    /**
     * Проверка frontmatter
     */
    checkFrontmatter(frontmatter, filePath) {
        const requiredFields = ['title', 'description', 'authorId', 'category'];

        for (const field of requiredFields) {
            if (!frontmatter[field]) {
                this.addIssue(filePath, `Отсутствует обязательное поле frontmatter: ${field}`);
            }
        }

        // Проверка длины описания
        if (frontmatter.description && frontmatter.description.length < 50) {
            this.addWarning(filePath, 'Описание слишком короткое (менее 50 символов)');
        }

        // Проверка estimatedMinutes
        if (frontmatter.estimatedMinutes && (frontmatter.estimatedMinutes < 5 || frontmatter.estimatedMinutes > 120)) {
            this.addWarning(filePath, 'Необычное время изучения (ожидается 5-120 минут)');
        }
    }

    /**
     * Проверка содержимого
     */
    checkContent(markdown, filePath) {
        // Подсчет слов
        const words = markdown.split(/\s+/).filter(word => word.length > 0);
        if (words.length < 800) {
            this.addIssue(filePath, `Недостаточно контента: ${words.length} слов (минимум 800)`);
        }

        // Проверка заголовков
        const headings = markdown.match(/^#{1,6}\s+.+$/gm) || [];
        if (headings.length < 3) {
            this.addWarning(filePath, 'Мало заголовков (рекомендуется минимум 3)');
        }

        // Проверка на TODO
        if (markdown.includes('TODO')) {
            this.addWarning(filePath, 'Найдены незавершенные TODO');
        }

        // Проверка на Lorem Ipsum
        if (/lorem\s+ipsum/i.test(markdown)) {
            this.addIssue(filePath, 'Найден placeholder текст (Lorem Ipsum)');
        }
    }

    /**
     * Проверка структуры документа
     */
    checkStructure(markdown, filePath) {
        const requiredSections = [
            '## 🎯 Что вы изучите',
            '## 📚 Теоретическая часть',
            '## 💻 Практические примеры',
            '## 🎯 Практические упражнения'
        ];

        for (const section of requiredSections) {
            if (!markdown.includes(section)) {
                this.addWarning(filePath, `Отсутствует раздел: ${section}`);
            }
        }
    }

    /**
     * Проверка примеров кода
     */
    checkCodeExamples(markdown, filePath) {
        const codeBlocks = markdown.match(/```go[\s\S]*?```/g) || [];

        if (codeBlocks.length < 3) {
            this.addIssue(filePath, `Недостаточно примеров кода: ${codeBlocks.length} (минимум 3)`);
        }

        // Проверка на компилируемость (простая проверка синтаксиса)
        codeBlocks.forEach((block, index) => {
            const code = block.replace(/```go\n?/, '').replace(/\n?```/, '');

            // Проверка на package declaration
            if (!code.includes('package ')) {
                this.addWarning(filePath, `Пример кода ${index + 1} не содержит package declaration`);
            }

            // Проверка на обработку ошибок
            if (code.includes('err :=') && !code.includes('if err != nil')) {
                this.addWarning(filePath, `Пример кода ${index + 1} не проверяет ошибки`);
            }
        });
    }

    /**
     * Проверка ссылок
     */
    async checkLinks(markdown, filePath) {
        // Внутренние ссылки
        const internalLinks = markdown.match(/\[([^\]]+)\]\((?!http)([^)]+)\)/g) || [];

        for (const link of internalLinks) {
            const path = link.match(/\(([^)]+)\)/)[1];
            if (!path.startsWith('#') && !existsSync(join('content', path))) {
                this.addWarning(filePath, `Битая внутренняя ссылка: ${path}`);
            }
        }

        // Внешние ссылки (только проверка формата)
        const externalLinks = markdown.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g) || [];

        for (const link of externalLinks) {
            const url = link.match(/\((https?:\/\/[^)]+)\)/)[1];
            try {
                new URL(url); // Проверка валидности URL
            } catch {
                this.addWarning(filePath, `Невалидный URL: ${url}`);
            }
        }
    }

    /**
     * Добавление критической проблемы
     */
    addIssue(file, message) {
        this.issues.push({ file, message });
        this.stats.issues++;
    }

    /**
     * Добавление предупреждения
     */
    addWarning(file, message) {
        this.warnings.push({ file, message });
        this.stats.warnings++;
    }

    /**
     * Вывод результатов
     */
    printResults() {
        console.log(chalk.blue('\n📊 Результаты проверки:\n'));

        // Статистика
        console.log(chalk.gray('Проверено файлов:'), this.stats.checkedFiles);
        console.log(chalk.red('Критических проблем:'), this.stats.issues);
        console.log(chalk.yellow('Предупреждений:'), this.stats.warnings);

        // Критические проблемы
        if (this.issues.length > 0) {
            console.log(chalk.red.bold('\n❌ Критические проблемы:\n'));
            this.issues.forEach(({ file, message }) => {
                console.log(chalk.red('  •'), chalk.gray(file));
                console.log(chalk.red('    →'), message);
            });
        }

        // Предупреждения
        if (this.warnings.length > 0) {
            console.log(chalk.yellow.bold('\n⚠️  Предупреждения:\n'));
            this.warnings.forEach(({ file, message }) => {
                console.log(chalk.yellow('  •'), chalk.gray(file));
                console.log(chalk.yellow('    →'), message);
            });
        }

        // Итог
        if (this.issues.length === 0 && this.warnings.length === 0) {
            console.log(chalk.green.bold('\n✅ Все проверки пройдены успешно!\n'));
        } else if (this.issues.length === 0) {
            console.log(chalk.yellow.bold('\n⚠️  Есть предупреждения, но критических проблем нет.\n'));
        } else {
            console.log(chalk.red.bold('\n❌ Найдены критические проблемы. Исправьте их перед публикацией.\n'));
        }

        // Рекомендации
        if (this.issues.length > 0 || this.warnings.length > 0) {
            console.log(chalk.blue('💡 Рекомендации:'));
            console.log(chalk.gray('  • Используйте'), chalk.yellow('npm run content:format'), chalk.gray('для автоматического форматирования'));
            console.log(chalk.gray('  • Проверьте'), chalk.yellow('npm run author:validate'), chalk.gray('для детальной проверки'));
            console.log(chalk.gray('  • См. руководство:'), chalk.cyan('CONTRIBUTING.md\n'));
        }
    }
}

// Запуск
const checker = new ContentChecker();
checker.run();