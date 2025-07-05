#!/usr/bin/env node

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import matter from 'gray-matter';
import prettier from 'prettier';

/**
 * Content Formatter
 * Форматирует markdown файлы согласно стандартам проекта
 */
class ContentFormatter {
    constructor() {
        this.stats = {
            totalFiles: 0,
            formattedFiles: 0,
            skippedFiles: 0,
            errors: 0
        };

        // Конфигурация prettier для markdown
        this.prettierConfig = {
            parser: 'markdown',
            printWidth: 80,
            proseWrap: 'preserve',
            tabWidth: 2,
            useTabs: false
        };
    }

    /**
     * Запуск форматирования
     */
    async run() {
        console.log(chalk.blue.bold('\n🎨 Форматирование markdown контента\n'));

        const spinner = ora('Поиск файлов для форматирования...').start();

        try {
            // Проверяем наличие директории content
            if (!existsSync('content')) {
                spinner.fail('Директория content не найдена');
                return;
            }

            // Находим все markdown файлы
            const files = await this.findMarkdownFiles('content');
            this.stats.totalFiles = files.length;

            spinner.text = `Найдено ${files.length} файлов`;

            // Форматируем каждый файл
            for (const file of files) {
                spinner.text = `Форматирование: ${relative(process.cwd(), file)}`;
                const formatted = await this.formatFile(file);

                if (formatted) {
                    this.stats.formattedFiles++;
                } else {
                    this.stats.skippedFiles++;
                }
            }

            spinner.succeed('Форматирование завершено!');

            // Выводим результаты
            this.printResults();

        } catch (error) {
            spinner.fail(`Ошибка: ${error.message}`);
            process.exit(1);
        }
    }

    /**
     * Поиск markdown файлов
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
     * Форматирование одного файла
     */
    async formatFile(filePath) {
        try {
            const content = await readFile(filePath, 'utf8');
            const { data: frontmatter, content: markdown } = matter(content);

            // Форматируем markdown часть
            let formattedMarkdown = await this.formatMarkdown(markdown);

            // Применяем дополнительные правила
            formattedMarkdown = this.applyCustomRules(formattedMarkdown);

            // Проверяем, изменился ли контент
            if (markdown === formattedMarkdown) {
                return false; // Файл уже отформатирован
            }

            // Собираем обратно с frontmatter
            const newContent = matter.stringify(formattedMarkdown, frontmatter);

            // Записываем обратно
            await writeFile(filePath, newContent, 'utf8');

            return true;

        } catch (error) {
            console.error(chalk.red(`\nОшибка в файле ${filePath}: ${error.message}`));
            this.stats.errors++;
            return false;
        }
    }

    /**
     * Форматирование markdown с prettier
     */
    async formatMarkdown(markdown) {
        try {
            return await prettier.format(markdown, this.prettierConfig);
        } catch (error) {
            // Если prettier не может отформатировать, возвращаем оригинал
            console.warn(chalk.yellow(`Prettier не смог отформатировать часть контента`));
            return markdown;
        }
    }

    /**
     * Применение кастомных правил форматирования
     */
    applyCustomRules(markdown) {
        let formatted = markdown;

        // 1. Унификация заголовков с эмодзи
        formatted = this.standardizeHeadings(formatted);

        // 2. Форматирование блоков кода
        formatted = this.formatCodeBlocks(formatted);

        // 3. Унификация списков
        formatted = this.standardizeLists(formatted);

        // 4. Добавление переносов строк
        formatted = this.fixLineBreaks(formatted);

        // 5. Исправление ссылок
        formatted = this.fixLinks(formatted);

        return formatted;
    }

    /**
     * Стандартизация заголовков
     */
    standardizeHeadings(markdown) {
        const headingMap = {
            // Основные разделы
            '## Что вы изучите': '## 🎯 Что вы изучите',
            '## Теоретическая часть': '## 📚 Теоретическая часть',
            '## Практические примеры': '## 💻 Практические примеры',
            '## Лучшие практики': '## 🔧 Лучшие практики',
            '## Частые ошибки': '## ⚠️ Частые ошибки',
            '## Применение в реальном мире': '## 🌍 Применение в реальном мире',
            '## Резюме': '## 📝 Резюме',
            '## Практические упражнения': '## 🎯 Практические упражнения',
            '## Дополнительные ресурсы': '## 🔗 Дополнительные ресурсы',
            '## Что дальше': '## ➡️ Что дальше',

            // Подразделы
            '### Основные концепции': '### Основные концепции',
            '### Ключевые принципы': '### Ключевые принципы',
            '### Когда и зачем использовать': '### Когда и зачем использовать'
        };

        let result = markdown;
        for (const [oldHeading, newHeading] of Object.entries(headingMap)) {
            const regex = new RegExp(`^${oldHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'gm');
            result = result.replace(regex, newHeading);
        }

        return result;
    }

    /**
     * Форматирование блоков кода
     */
    formatCodeBlocks(markdown) {
        // Убеждаемся, что все блоки кода имеют язык
        return markdown.replace(/```\n/g, '```go\n');
    }

    /**
     * Стандартизация списков
     */
    standardizeLists(markdown) {
        // Заменяем * на - в списках
        let result = markdown;

        // Простые списки
        result = result.replace(/^\* /gm, '- ');

        // Вложенные списки
        result = result.replace(/^  \* /gm, '  - ');
        result = result.replace(/^    \* /gm, '    - ');

        return result;
    }

    /**
     * Исправление переносов строк
     */
    fixLineBreaks(markdown) {
        let result = markdown;

        // Двойной перенос перед заголовками
        result = result.replace(/\n(#{1,6} )/g, '\n\n$1');

        // Двойной перенос после блоков кода
        result = result.replace(/```\n\n/g, '```\n');
        result = result.replace(/```\n([^#])/g, '```\n\n$1');

        // Убираем лишние переносы (более 2 подряд)
        result = result.replace(/\n{3,}/g, '\n\n');

        return result;
    }

    /**
     * Исправление ссылок
     */
    fixLinks(markdown) {
        let result = markdown;

        // Добавляем https:// к ссылкам без протокола
        result = result.replace(/\[([^\]]+)\]\(((?!https?:\/\/|#|\/)[^)]+\.[^)]+)\)/g, '[$1](https://$2)');

        return result;
    }

    /**
     * Вывод результатов
     */
    printResults() {
        console.log(chalk.blue('\n📊 Результаты форматирования:\n'));

        console.log(chalk.gray('Всего файлов:'), this.stats.totalFiles);
        console.log(chalk.green('Отформатировано:'), this.stats.formattedFiles);
        console.log(chalk.yellow('Пропущено (уже отформатированы):'), this.stats.skippedFiles);

        if (this.stats.errors > 0) {
            console.log(chalk.red('Ошибок:'), this.stats.errors);
        }

        if (this.stats.formattedFiles > 0) {
            console.log(chalk.green('\n✅ Файлы успешно отформатированы!'));
            console.log(chalk.gray('\n💡 Совет: Проверьте изменения перед коммитом:'));
            console.log(chalk.cyan('   git diff\n'));
        } else {
            console.log(chalk.green('\n✅ Все файлы уже отформатированы правильно!\n'));
        }
    }
}

// Запуск
const formatter = new ContentFormatter();
formatter.run();