# -*- coding: utf-8 -*-
"""Kyco - Kytos Contoller

This module contains the main class of Kyco, which is
:class:`~.controller.Controller`.

Basic usage:

.. code-block:: python3

    controller = Controller()
    controller.start()
"""

import os

from importlib.machinery import SourceFileLoader
from threading import Thread

from kyco.core.buffers import KycoBuffers
from kyco.core.events import KycoNullEvent
from kyco.core.event_handlers import raw_event_handler
from kyco.core.event_handlers import msg_in_event_handler
from kyco.core.event_handlers import msg_out_event_handler
from kyco.core.event_handlers import app_event_handler
from kyco.core.tcp_server import KycoOpenFlowRequestHandler
from kyco.core.tcp_server import KycoServer
from kyco.utils import KycoCoreNApp
from kyco.utils import KycoNApp
from kyco.utils import start_logger


log = start_logger()

HOST = '127.0.0.1'
PORT = 6633
CONTROLLER_DIR = os.path.dirname(os.path.abspath(__file__))
CORE_NAPPS_DIR = os.path.join(CONTROLLER_DIR, 'core/apps')
NAPPS_DIR = os.path.join(CONTROLLER_DIR, 'apps')


class Controller(object):
    """This is the main class of Kyco.

    The main responsabilities of this class is:
        - start a thread with :class:`~.core.tcp_server.KycoServer`;
        - manage KycoCoreNApps (load and unload);
        - manage KycoNApps (install, load and unload);
        - keep the buffers (instance of :class:`~core.buffers.KycoBuffers`);
        - manage which event should be sent to NApps methods;
        - manage the buffers handlers, considering one thread per handler.
    """
    def __init__(self):
        self._threads = {}
        self.buffers = KycoBuffers()
        self.connection_pool = {}
        self.core_napps = {}
        self.events_listeners = {}
        self.napps = {}
        self.server = None

    def start(self):
        """Start the controller.

        Starts a thread with the KycoServer (TCP Server).
        Starts a thread for each buffer handler.
        Load the installed apps."""
        log.info("Starting Kyco - Kytos Controller")
        self.server = KycoServer((HOST, PORT), KycoOpenFlowRequestHandler,
                                 self.buffers.raw_events.put)

        thrds = {'tcp_server': Thread(name='TCP server',
                                      target=self.server.serve_forever),
                 'raw_event_handler': Thread(name='RawEvent Handler',
                                             target=raw_event_handler,
                                             args=[self.events_listeners,
                                                   self.connection_pool,
                                                   self.buffers.raw_events,
                                                   self.buffers.msg_in_events,
                                                   self.buffers.app_events]),
                 'msg_in_event_handler': Thread(name='MsgInEvent Handler',
                                                target=msg_in_event_handler,
                                                args=[self.events_listeners,
                                                      self.buffers.msg_in_events]),
                 'msg_out_event_handler': Thread(name='MsgOutEvent Handler',
                                                 target=msg_out_event_handler,
                                                 args=[self.events_listeners,
                                                       self.connection_pool,
                                                       self.buffers.msg_out_events]),
                 'app_event_handler': Thread(name='AppEvent Handler',
                                             target=app_event_handler,
                                             args=[self.events_listeners,
                                                   self.buffers.app_events])}

        self._threads = thrds
        for _, thread in self._threads.items():
            thread.start()

        log.info("Loading kyco core apps...")
        self.load_core_napps()

        log.info("Loading kyco apps...")
        self.load_napps()

    def stop(self):
        """Stops the controller.

        This method should:
            - announce on the network that the controller will shutdown;
            - stop receiving incoming packages;
            - call the 'shutdown' method of each KycoNApp that is running;
            - finish reading the events on all buffers;
            - stop each running handler;
            - stop all running threads;
            - stop the KycoServer;
        """
        log.info("Stopping Kyco")
        self.server.socket.close()
        self.server.shutdown()
        # TODO: This is not working... How to kill the handlers threads?
        #       the join() wait the method to end,
        #       but there we have a while True...
        self.buffers.send_stop_signal()

        self.unload_napps()
        self.unload_core_napps()

        for _, thread in self._threads.items():
            log.info("Stopping thread: %s", thread.name)
            thread.join()

        for _, thread in self._threads.items():
            while thread.is_alive():
                pass

    def load_core_napp(self, napp_name):
        path = os.path.join(CORE_NAPPS_DIR, napp_name, 'main.py')
        module = SourceFileLoader(napp_name, path)
        napp_main_class = module.load_module().Main

        args = {'add_to_msg_out_buffer': self.buffers.msg_out_events.put,
                'add_to_app_buffer': self.buffers.app_events.put}

        if napp_main_class.msg_in_buffer:
            args['add_to_msg_in_buffer'] = self.buffers.msg_in_events.put

        napp = napp_main_class(**args)

        self.core_napps[napp_name] = napp

        for event_type, listeners in napp._listeners.items():
            if event_type not in self.events_listeners:
                self.events_listeners[event_type] = []
            self.events_listeners[event_type].extend(listeners)

    def load_core_napps(self):
        for napp_name in os.listdir(CORE_NAPPS_DIR):
            if os.path.isdir(os.path.join(CORE_NAPPS_DIR, napp_name)):
                log.info("Loading core app %s", napp_name)
                self.load_core_napp(napp_name)

    def unload_core_napp(self, napp_name):
        napp = self.core_napps.pop(napp_name)
        napp.shutdown()

    def unload_core_napps(self):
        # list() is used here to avoid the error:
        # 'RuntimeError: dictionary changed size during iteration'
        for napp_name in list(self.core_napps):
            self.unload_core_napp(napp_name)

    def install_napp(self, napp_name):
        """Install the requested NApp by its name"""
        pass

    def load_napp(self, napp_name):
        path = os.path.join(NAPPS_DIR, napp_name, 'main.py')
        module = SourceFileLoader(napp_name, path)
        napp_main_class = module.load_module().Main

        args = {'add_to_msg_out_buffer': self.buffers.msg_out_events.put,
                'add_to_app_buffer': self.buffers.app_events.put}

        if issubclass(napp_main_class, KycoCoreNApp):
            if napp_main_class.msg_in_buffer:
                args['add_to_msg_in_buffer'] = self.buffers.msg_in_events.put

        napp = napp_main_class(**args)

        self.napps[napp_name] = napp

        for event_type, listeners in napp._listeners.items():
            if event_type not in self.events_listeners:
                self.events_listeners[event_type] = []
            self.events_listeners[event_type].extend(listeners)

    def load_napps(self):
        for napp_name in os.listdir(NAPPS_DIR):
            if os.path.isdir(os.path.join(NAPPS_DIR, napp_name)):
                log.info("Loading app %s", napp_name)
                self.load_napp(napp_name)

    def unload_napp(self, napp_name):
        napp = self.napps.pop(napp_name)
        napp.shutdown()

    def unload_napps(self):
        # list() is used here to avoid the error:
        # 'RuntimeError: dictionary changed size during iteration'
        for napp_name in list(self.napps):
            self.unload_napp(napp_name)
