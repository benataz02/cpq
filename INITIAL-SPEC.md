# Objective
I want to create a cpq that is able to solve the most common problems of SME manufacturing companies which use SAP B1 by exploiting their historical production and sales data to provide more accurate and faster product configurations and automated sales-to-production process.

# Product functionalities

## ERP/MES integration + n8n
The product will integrate with SAP B1 using Service Layer to retrieve all the master data from the ERP or other MES system (Beas Manufacturing, etc.) so main integration point will be SAP and then open to integrate also with other system / datasources.

It will be able to perform crud operations on the ERP such as:
- Read/create/edit quotations, sales orders
- Read/create/edit business partner, item data
- Connect with MES/Other API/datasources to read/create/edit BOM / Routings

It will integrate with n8n to create any kind of automatizations in the sales-to-production process.

## Historical Data
The app will be able to read and extract relevant historical data from sales and production to provide support or even automate the configuration process by finding similar past productions/sales item data. To achieve this, the app will be able to perform deep technical analysis from the historical data to find the most relevant parameters from sales/production for a set of defined product families by the users.

The parameters extracted from the technical analysis will be saved by family and will be exploited by the product configurator. The analysis can be performed as many times as wanted using different methods to obtain the most accurate insight possible and rank the most important parameters by importance, to then use them to find similar products.

## Product Configurator
The main strong point must be the product configurator. It will have a configurator builder to create configurations for different products/families. These builds will be the base framework for the configuration flow, they will:
- Set the rules / constraints
- Build the framework of the configuration state and how it will be changed

There will be two kinds of product configurator. Both will work with the same base framework. So user will be able to switch from automated to manual mode and viceversa depending on its needs.

Both configurator modes will extract similar product information to assist the user or even automate the configuration process.

### Manual Product Configurator
The manual configurator will be use the selected product configuration as base to build the UI for the user to configure the product, using elements such as:
- Tables
- Images
- Formullas
- Any kind of input fields (dropdown, input, multicombobox, etc.)
- Sections, subsections

It will find similar item data as the user is entering the configuration parameters and show it to the user as suggestion or to copy directly the suggestion.

### The automated configurator
The automated configurator will use the same built configuration frameworks with the rules and constraints and will strictly follow it. The functionalitites will be:
- User will provide images, emails, technical drowings, etc. the configurator will use claude or other AI Provider to extract the information and build the configuration always following the stablished framework.
- It will extract similar product information and show the user the most relevant past productions, sales prices or even configurations.
- In case of doubt, the AI configuator agent will ask questions to the user, give options, and other kinds of functionalities to ease and automate the configuration
- The agent will be able to call other subagents such as UI subagent to generate UI dinamically to show suggestions, prices, and other elements

# Stack
- Frontend: React + Vite + tanstack router + tanstack query
- UI: SAP UI5 Webcomponents for React
- Backend: ???

# Architecture
???