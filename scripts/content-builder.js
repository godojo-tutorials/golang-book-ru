#!/usr/bin/env node

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import matter from 'gray-matter';
import { marked } from 'marked';
import yaml from 'yaml';

/**
 * Content Builder
 * Собирает контент в формат для godojo.dev платформы
 */
class ContentBuilder {
    constructor() {
        this.outputDir = 'build';
        this.categories = new Map();
        this.topics = [];
        this.stats = {
            categories: 0,
            topics: 0,
            exercises: 0,
            codeExamples: 0
        };
    }

    /**
     * Запуск сборки
     */
    async run() {
        console.log(chalk.blue.bold('\n🏗️  Сборка контента для godojo.dev\n'));

        const spinner = ora('Подготовка к сборке...').start();

        try {
            // Создаем директорию для сборки
            await this.ensureOutputDir();

            // Загружаем конфигурацию
            spinner.text = 'Загрузка конфигурации...';
            const config = await this.loadConfig();

            // Сканируем контент
            spinner.text = 'Сканирование контента...';
            await this.scanContent();

            // Генерируем выходные файлы
            spinner.text = 'Генерация файлов...';
            await this.generateOutput(config);

            // Создаем индексы
            spinner.text = 'Создание индексов...';
            await this.generateIndexes();

            // Генерируем манифест
            spinner.text = 'Создание манифеста...';
            await this.generateManifest(config);

            spinner.succeed('Сборка завершена!');

            // Выводим результаты
            this.printResults();

        } catch (error) {
            spinner.fail(`Ошибка: ${error.message}`);
            console.error(chalk.red('\nДетали ошибки:'), error);
            process.exit(1);
        }
    }

    /**
     * Создание директории для сборки
     */
    async ensureOutputDir() {
        if (!existsSync(this.outputDir)) {
            await mkdir(this.outputDir, { recursive: true });
        }
    }

    /**
     * Загрузка конфигурации
     */
    async loadConfig() {
        const configPath = 'content.config.json';

        if (!existsSync(configPath)) {
            throw new Error('Файл content.config.json не найден');
        }

        const configContent = await readFile(configPath, 'utf8');
        return JSON.parse(configContent);
    }

    /**
     * Сканирование контента
     */
    async scanContent() {
        const contentDir = 'content';

        if (!existsSync(contentDir)) {
            throw new Error('Директория content не найдена');
        }

        // Сканируем категории
        const categoryDirs = await readdir(contentDir, { withFileTypes: true });

        for (const dir of categoryDirs) {
            if (dir.isDirectory()) {
                await this.scanCategory(join(contentDir, dir.name));
            }
        }
    }

    /**
     * Сканирование категории
     */
    async scanCategory(categoryPath) {
        const categorySlug = dirname(categoryPath).split('/').pop();

        // Читаем index.md категории
        const indexPath = join(categoryPath, 'index.md');
        if (existsSync(indexPath)) {
            const content = await readFile(indexPath, 'utf8');
            const { data } = matter(content);

            this.categories.set(categorySlug, {
                slug: categorySlug,
                ...data,
                topics: []
            });

            this.stats.categories++;
        }

        // Сканируем темы
        const topicDirs = await readdir(categoryPath, { withFileTypes: true });

        for (const dir of topicDirs) {
            if (dir.isDirectory()) {
                await this.scanTopic(join(categoryPath, dir.name), categorySlug);
            }
        }
    }

    /**
     * Сканирование темы
     */
    async scanTopic(topicPath, categorySlug) {
        const topicFile = join(topicPath, 'topic.md');

        if (!existsSync(topicFile)) {
            return;
        }

        const content = await readFile(topicFile, 'utf8');
        const { data: frontmatter, content: markdown } = matter(content);

        // Парсим markdown для извлечения структуры
        const parsed = await this.parseMarkdown(markdown);

        const topic = {
            ...frontmatter,
            category: categorySlug,
            content: {
                theory: parsed.theory,
                examples: parsed.examples,
                exercises: parsed.exercises,
                bestPractices: parsed.bestPractices,
                commonMistakes: parsed.commonMistakes,
                realWorld: parsed.realWorld,
                summary: parsed.summary
            },
            stats: {
                wordCount: this.countWords(markdown),
                codeExamples: parsed.examples.length,
                exercises: parsed.exercises.length,
                readingTime: Math.ceil(this.countWords(markdown) / 200) // 200 слов в минуту
            }
        };

        this.topics.push(topic);

        // Добавляем в категорию
        const category = this.categories.get(categorySlug);
        if (category) {
            category.topics.push({
                slug: frontmatter.slug,
                title: frontmatter.title,
                module: frontmatter.module
            });
        }

        // Обновляем статистику
        this.stats.topics++;
        this.stats.codeExamples += parsed.examples.length;
        this.stats.exercises += parsed.exercises.length;
    }

    /**
     * Парсинг markdown контента
     */
    async parseMarkdown(markdown) {
        const sections = {
            theory: '',
            examples: [],
            exercises: [],
            bestPractices: '',
            commonMistakes: '',
            realWorld: '',
            summary: ''
        };

        // Разбиваем контент на секции по заголовкам
        const sectionRegex = /^## (.+)$/gm;
        const parts = markdown.split(sectionRegex);

        for (let i = 1; i < parts.length; i += 2) {
            const heading = parts[i];
            const content = parts[i + 1] || '';

            switch (heading) {
                case '📚 Теоретическая часть':
                    sections.theory = content.trim();
                    break;

                case '💻 Практические примеры':
                    sections.examples = this.extractCodeExamples(content);
                    break;

                case '🎯 Практические упражнения':
                    sections.exercises = this.extractExercises(content);
                    break;

                case '🔧 Лучшие практики':
                    sections.bestPractices = content.trim();
                    break;

                case '⚠️ Частые ошибки':
                    sections.commonMistakes = content.trim();
                    break;

                case '🌍 Применение в реальном мире':
                    sections.realWorld = content.trim();
                    break;

                case '📝 Резюме':
                    sections.summary = content.trim();
                    break;
            }
        }

        return sections;
    }

    /**
     * Извлечение примеров кода
     */
    extractCodeExamples(content) {
        const examples = [];
        const exampleRegex = /### (.+?)\n([\s\S]*?)(?=###|$)/g;

        let match;
        while ((match = exampleRegex.exec(content)) !== null) {
            const title = match[1].trim();
            const exampleContent = match[2].trim();

            // Извлекаем код
            const codeMatch = exampleContent.match(/```go\n([\s\S]*?)\n```/);
            const code = codeMatch ? codeMatch[1] : '';

            // Извлекаем объяснение
            const explanation = exampleContent
                .replace(/```go\n[\s\S]*?\n```/g, '')
                .trim();

            examples.push({
                title,
                code,
                explanation
            });
        }

        return examples;
    }

    /**
     * Извлечение упражнений
     */
    extractExercises(content) {
        const exercises = [];
        const exerciseRegex = /### Упражнение (\d+): (.+?)\n([\s\S]*?)(?=###|$)/g;

        let match;
        while ((match = exerciseRegex.exec(content)) !== null) {
            const number = parseInt(match[1]);
            const title = match[2].trim();
            const exerciseContent = match[3].trim();

            exercises.push({
                number,
                title,
                content: exerciseContent
            });
        }

        return exercises;
    }

    /**
     * Подсчет слов
     */
    countWords(text) {
        // Убираем код и frontmatter для точного подсчета
        const cleanText = text
            .replace(/```[\s\S]*?```/g, '')
            .replace(/^---[\s\S]*?---/m, '');

        return cleanText.split(/\s+/).filter(word => word.length > 0).length;
    }

    /**
     * Генерация выходных файлов
     */
    async generateOutput(config) {
        // Генерируем JSON для каждой темы
        for (const topic of this.topics) {
            const outputPath = join(
                this.outputDir,
                'topics',
                topic.category,
                `${topic.slug}.json`
            );

            await this.ensureDir(dirname(outputPath));
            await writeFile(outputPath, JSON.stringify(topic, null, 2));
        }

        // Генерируем YAML для категорий
        for (const [slug, category] of this.categories) {
            const outputPath = join(
                this.outputDir,
                'categories',
                `${slug}.yaml`
            );

            await this.ensureDir(dirname(outputPath));
            await writeFile(outputPath, yaml.stringify(category));
        }
    }

    /**
     * Генерация индексов
     */
    async generateIndexes() {
        // Индекс всех тем
        const topicsIndex = this.topics.map(topic => ({
            slug: topic.slug,
            title: topic.title,
            category: topic.category,
            module: topic.module,
            difficulty: topic.difficulty,
            estimatedMinutes: topic.estimatedMinutes,
            tags: topic.tags
        }));

        await writeFile(
            join(this.outputDir, 'topics-index.json'),
            JSON.stringify(topicsIndex, null, 2)
        );

        // Индекс категорий
        const categoriesIndex = Array.from(this.categories.values()).map(cat => ({
            slug: cat.slug,
            title: cat.title,
            description: cat.description,
            difficulty: cat.difficulty,
            topicsCount: cat.topics.length
        }));

        await writeFile(
            join(this.outputDir, 'categories-index.json'),
            JSON.stringify(categoriesIndex, null, 2)
        );
    }

    /**
     * Генерация манифеста
     */
    async generateManifest(config) {
        const manifest = {
            version: '1.0.0',
            generated: new Date().toISOString(),
            platform: 'godojo.dev',
            language: config.structure.defaultLanguage,
            repository: 'golang-book-ru',
            stats: {
                categories: this.stats.categories,
                topics: this.stats.topics,
                exercises: this.stats.exercises,
                codeExamples: this.stats.codeExamples
            },
            structure: {
                categories: Array.from(this.categories.keys()),
                modulesRange: {
                    min: Math.min(...this.topics.map(t => t.module)),
                    max: Math.max(...this.topics.map(t => t.module))
                }
            }
        };

        await writeFile(
            join(this.outputDir, 'manifest.json'),
            JSON.stringify(manifest, null, 2)
        );
    }

    /**
     * Создание директории
     */
    async ensureDir(dir) {
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }
    }

    /**
     * Вывод результатов
     */
    printResults() {
        console.log(chalk.blue('\n📊 Результаты сборки:\n'));

        console.log(chalk.gray('Категорий:'), this.stats.categories);
        console.log(chalk.gray('Тем:'), this.stats.topics);
        console.log(chalk.gray('Примеров кода:'), this.stats.codeExamples);
        console.log(chalk.gray('Упражнений:'), this.stats.exercises);

        console.log(chalk.green('\n✅ Контент успешно собран!'));
        console.log(chalk.gray('\n📁 Результаты в директории:'), chalk.cyan(this.outputDir));

        console.log(chalk.blue('\n📋 Созданные файлы:'));
        console.log(chalk.gray('  • manifest.json'), '- манифест сборки');
        console.log(chalk.gray('  • topics-index.json'), '- индекс всех тем');
        console.log(chalk.gray('  • categories-index.json'), '- индекс категорий');
        console.log(chalk.gray('  • topics/'), '- JSON файлы тем');
        console.log(chalk.gray('  • categories/'), '- YAML файлы категорий');

        console.log(chalk.yellow('\n💡 Следующий шаг:'));
        console.log(chalk.gray('  Используйте'), chalk.cyan('npm run godojo:validate'), chalk.gray('для проверки совместимости\n'));
    }
}

// Запуск
const builder = new ContentBuilder();
builder.run();