--
-- PostgreSQL database dump
--

-- Dumped from database version 14.7 (Homebrew)
-- Dumped by pg_dump version 14.7 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: test_collection; Type: TABLE; Schema: public; Owner: taylorromero
--

CREATE TABLE public.test_collection (
    id integer NOT NULL,
    name character varying NOT NULL,
    count integer,
    ispublic boolean,
    number integer,
    names jsonb,
    uniquefield character varying,
    uniquefield2 character varying,
    uniquefield3 character varying,
    uniquefield4 character varying,
    somefield character varying,
    somefield2 character varying,
    somefield3 character varying,
    otherfield character varying,
    otherfield2 character varying,
    someotherfield character varying,
    randomuniquefield character varying,
    target jsonb,
    slug character varying,
    anonindexedfield boolean,
    undefinedfield character varying,
    nullfield character varying
);


ALTER TABLE public.test_collection OWNER TO taylorromero;

--
-- Name: test_collection_id_seq; Type: SEQUENCE; Schema: public; Owner: taylorromero
--

CREATE SEQUENCE public.test_collection_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.test_collection_id_seq OWNER TO taylorromero;

--
-- Name: test_collection_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: taylorromero
--

ALTER SEQUENCE public.test_collection_id_seq OWNED BY public.test_collection.id;


--
-- Name: user; Type: TABLE; Schema: public; Owner: taylorromero
--

CREATE TABLE public."user" (
    id integer NOT NULL,
    name character varying NOT NULL,
    count integer,
    ispublic boolean,
    number integer,
    names jsonb,
    uniquefield character varying,
    uniquefield2 character varying,
    uniquefield3 character varying,
    uniquefield4 character varying,
    somefield character varying,
    somefield2 character varying,
    somefield3 character varying,
    otherfield character varying,
    otherfield2 character varying,
    someotherfield character varying,
    randomuniquefield character varying,
    target jsonb,
    slug character varying,
    anonindexedfield boolean,
    undefinedfield character varying,
    nullfield character varying
);


ALTER TABLE public."user" OWNER TO taylorromero;

--
-- Name: user_id_seq; Type: SEQUENCE; Schema: public; Owner: taylorromero
--

CREATE SEQUENCE public.user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_id_seq OWNER TO taylorromero;

--
-- Name: user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: taylorromero
--

ALTER SEQUENCE public.user_id_seq OWNED BY public."user".id;


--
-- Name: test_collection id; Type: DEFAULT; Schema: public; Owner: taylorromero
--

ALTER TABLE ONLY public.test_collection ALTER COLUMN id SET DEFAULT nextval('public.test_collection_id_seq'::regclass);


--
-- Name: user id; Type: DEFAULT; Schema: public; Owner: taylorromero
--

ALTER TABLE ONLY public."user" ALTER COLUMN id SET DEFAULT nextval('public.user_id_seq'::regclass);


--
-- Data for Name: test_collection; Type: TABLE DATA; Schema: public; Owner: taylorromero
--

COPY public.test_collection (id, name, count, ispublic, number, names, uniquefield, uniquefield2, uniquefield3, uniquefield4, somefield, somefield2, somefield3, otherfield, otherfield2, someotherfield, randomuniquefield, target, slug, anonindexedfield, undefinedfield, nullfield) FROM stdin;
\.


--
-- Data for Name: user; Type: TABLE DATA; Schema: public; Owner: taylorromero
--

COPY public."user" (id, name, count, ispublic, number, names, uniquefield, uniquefield2, uniquefield3, uniquefield4, somefield, somefield2, somefield3, otherfield, otherfield2, someotherfield, randomuniquefield, target, slug, anonindexedfield, undefinedfield, nullfield) FROM stdin;
\.


--
-- Name: test_collection_id_seq; Type: SEQUENCE SET; Schema: public; Owner: taylorromero
--

SELECT pg_catalog.setval('public.test_collection_id_seq', 1, false);


--
-- Name: user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: taylorromero
--

SELECT pg_catalog.setval('public.user_id_seq', 1, false);


--
-- Name: test_collection test_collection_pk; Type: CONSTRAINT; Schema: public; Owner: taylorromero
--

ALTER TABLE ONLY public.test_collection
    ADD CONSTRAINT test_collection_pk PRIMARY KEY (id);


--
-- Name: user user_pk; Type: CONSTRAINT; Schema: public; Owner: taylorromero
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pk PRIMARY KEY (id);


--
-- PostgreSQL database dump complete
--

